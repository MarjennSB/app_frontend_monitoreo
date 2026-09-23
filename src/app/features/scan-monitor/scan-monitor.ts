import { Component, OnInit, OnDestroy, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NetworksService } from '../../core/services/networks.service';
import { DevicesService } from '../../core/services/devices.service';
import { WebsocketService } from '../../core/services/websocket.service';
import { Network } from '../../core/models/network.model';
import { Device } from '../../core/models/device.model';
import { Subscription } from 'rxjs';
import { Network as VisNetwork } from 'vis-network';
import { DataSet } from 'vis-data';

interface GridBox {
  id: number;
  address: string;
  status: 'free' | 'alive' | 'down';
  statusLabel: string;
  user: string;
  openPorts?: string;
  os?: string;
  vendor?: string;
  pulsing?: boolean;
  isLocal?: boolean;
}

@Component({
  selector: 'app-scan-monitor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './scan-monitor.html',
  styleUrls: ['./scan-monitor.css']
})
export class ScanMonitorComponent implements OnInit, OnDestroy, AfterViewInit {
  private networksService = inject(NetworksService);
  private devicesService = inject(DevicesService);
  private wsService = inject(WebsocketService);

  networks: Network[] = [];
  selectedNetwork: Network | null = null;
  selectedNetworkId: number | null = null;
  
  gridIps: GridBox[] = [];
  isScanning = false;
  
  // Status info from WS
  scannerMode = '';
  lastScanAt: Date | null = null;
  nextScanAt: Date | null = null;
  countdownStr = '';
  
  private wsSubscription?: Subscription;
  private countdownTimer: any;

  // Topology State
  showTopology = false;
  selectedNodeDetails: GridBox | null = null;
  private networkInstance: any;
  private nodesDataset: any;
  private edgesDataset: any;

  get onlineCount(): number {
    return this.gridIps.filter(ip => ip.status === 'alive').length;
  }

  get downCount(): number {
    return this.gridIps.filter(ip => ip.status === 'down').length;
  }

  get freeCount(): number {
    return this.gridIps.filter(ip => ip.status === 'free').length;
  }

  get usagePercentage(): number {
    if (this.gridIps.length === 0) return 0;
    const used = this.onlineCount + this.downCount;
    return Math.round((used / this.gridIps.length) * 100);
  }

  get osSummary(): { os: string; icon: string; count: number }[] {
    const counts = new Map<string, number>();
    this.gridIps.forEach(ip => {
      if (ip.status === 'alive') {
        const osName = ip.os || 'Desconocido';
        counts.set(osName, (counts.get(osName) || 0) + 1);
      }
    });

    const summary: { os: string; icon: string; count: number }[] = [];
    counts.forEach((count, os) => {
      let icon = 'ri-question-line';
      if (os.includes('Windows')) icon = 'ri-windows-fill text-info';
      else if (os.includes('Linux')) icon = 'ri-ubuntu-fill text-warning';
      else if (os.includes('Router')) icon = 'ri-router-line text-primary';
      else if (os.includes('Cámara')) icon = 'ri-camera-lens-fill text-danger';
      else if (os.includes('Impresora')) icon = 'ri-printer-fill text-secondary';
      else if (os.includes('Móvil')) icon = 'ri-smartphone-line text-success';
      else if (os.includes('Teléfono VoIP')) icon = 'ri-phone-fill text-primary';
      else if (os.includes('Apple')) icon = 'ri-apple-fill text-dark';
      else if (os.includes('Web')) icon = 'ri-server-line text-info';
      
      summary.push({ os, icon, count });
    });

    // Sort descending by count
    return summary.sort((a, b) => b.count - a.count);
  }

  copyToastMessage: string | null = null;

  copyToClipboard(ipAddress: string) {
    if (!ipAddress) return;
    navigator.clipboard.writeText(ipAddress).then(() => {
      this.copyToastMessage = `IP ${ipAddress} copiada!`;
      setTimeout(() => this.copyToastMessage = null, 3000);
    }).catch(err => {
      console.error('Error al copiar IP: ', err);
    });
  }

  ngOnInit() {
    this.loadNetworks();

    // Escuchar actualizaciones en tiempo real del WebSocket
    this.wsSubscription = this.wsService.onMessage().subscribe((msg) => {
      if (msg.type === 'scan_update' && msg.devices) {
        console.log('[ScanMonitor] Recibido update por WS', msg.devices.length, 'dispositivos');
        this.mergeDevicesIntoGrid(msg.devices);
        this.isScanning = false;
      } else if (msg.type === 'host_discovered') {
        console.log('[ScanMonitor] host_discovered:', msg);
        const idx = this.gridIps.findIndex(g => g.address === msg['ip']);
        if (idx !== -1) {
          if (msg['is_alive']) {
             this.gridIps[idx].status = 'alive';
             // Activar el pulso visual (Sonar Glow)
             this.gridIps[idx].pulsing = true;
             if (msg['os']) {
                this.gridIps[idx].os = msg['os'];
             }
             if (msg['vendor']) {
                this.gridIps[idx].vendor = msg['vendor'];
             }
             if (msg['is_local'] !== undefined) {
                this.gridIps[idx].isLocal = msg['is_local'];
             }
             
             // Guardar actualización parcial en caché local
             this.saveToLocalCache(this.gridIps[idx].address, {
                os: this.gridIps[idx].os,
                vendor: this.gridIps[idx].vendor,
                isLocal: this.gridIps[idx].isLocal
             });
             
             setTimeout(() => {
               if (this.gridIps[idx]) {
                 this.gridIps[idx].pulsing = false;
               }
             }, 2000);
          } else {
             // Si la caja ya tenía un dispositivo asignado pero no respondió al ping,
             // la marcamos como caída. Si estaba "free", se mantiene "free".
             if (this.gridIps[idx].status === 'alive' || this.gridIps[idx].status === 'down') {
                this.gridIps[idx].status = 'down';
             }
          }
          this.updateNodeInTopology(this.gridIps[idx]);
        }
      } else if (msg.type === 'status_update') {
        this.scannerMode = msg.mode || '';
        this.isScanning = !!msg.is_scanning;
        this.lastScanAt = msg.last_scan_at ? new Date(msg.last_scan_at) : null;
        this.nextScanAt = msg.next_scan_at ? new Date(msg.next_scan_at) : null;
      }
    });

    // Iniciar temporizador
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000);
  }

  ngOnDestroy() {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }
    if (this.networkInstance) {
      this.networkInstance.destroy();
    }
    this.wsService.disconnect();
  }

  ngAfterViewInit() {
    // Initial topology render if switch is on
    if (this.showTopology) {
      this.initTopology();
    }
  }

  toggleTopologyView(show: boolean) {
    this.showTopology = show;
    if (show) {
      setTimeout(() => this.initTopology(), 100);
    }
  }

  initTopology() {
    const container = document.getElementById('topology-network');
    if (!container) return;

    this.nodesDataset = new DataSet();
    this.edgesDataset = new DataSet();

    const data = { nodes: this.nodesDataset, edges: this.edgesDataset };
    
    // Tema oscuro para que combine con el dashboard
    const options = {
      nodes: {
        shape: 'dot',
        size: 16,
        font: { size: 14, color: '#ffffff', strokeWidth: 3, strokeColor: '#212529' },
        borderWidth: 2,
        shadow: true
      },
      edges: {
        width: 1,
        color: { color: '#495057', highlight: '#0ab39c' },
        shadow: true,
        smooth: { type: 'continuous' }
      },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -80,
          centralGravity: 0.005,
          springLength: 250,
          springConstant: 0.18,
        },
        maxVelocity: 146,
        solver: 'forceAtlas2Based',
        timestep: 0.35,
        stabilization: { iterations: 150 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
      }
    };
    
    this.networkInstance = new VisNetwork(container, data, options);
    
    this.networkInstance.on('selectNode', (params: any) => {
      const nodeId = params.nodes[0];
      const node = this.nodesDataset.get(nodeId);
      if (node && node.gridBox) {
         this.selectedNodeDetails = node.gridBox;
      }
    });
    
    this.networkInstance.on('deselectNode', () => {
      this.selectedNodeDetails = null;
    });

    this.buildTopologyFromGrid();
  }

  buildTopologyFromGrid() {
    if (!this.nodesDataset || !this.selectedNetwork) return;

    // Clear existing
    this.nodesDataset.clear();
    this.edgesDataset.clear();

    // Add Central Router Node
    this.nodesDataset.add({
      id: 'router',
      label: this.selectedNetwork.cidr,
      shape: 'hexagon',
      size: 35,
      color: { background: '#299cdb', border: '#ffffff' },
      font: { color: '#ffffff', size: 16, bold: true, strokeWidth: 3, strokeColor: '#212529' }
    });

    // Add active and down devices
    const nodesToAdd: any[] = [];
    const edgesToAdd: any[] = [];

    this.gridIps.forEach(ip => {
      if (ip.status !== 'free') {
        let nodeColor = ip.status === 'alive' ? '#0ab39c' : '#f06548';
        if (ip.isLocal) {
            nodeColor = '#8a2be2'; // Púrpura para el servidor local
        }
        
        const displayUser = (ip.user === 'unknown' || ip.user === 'Desconocido' || ip.user === 'Sin nombre') ? '' : ip.user;
        const labelText = displayUser ? `${displayUser}\n${ip.address}` : ip.address;
        
        nodesToAdd.push({
          id: ip.address,
          label: labelText,
          color: { background: nodeColor, border: '#ffffff' },
          gridBox: ip
        });
        edgesToAdd.push({
          from: 'router',
          to: ip.address,
          color: { color: nodeColor }
        });
      }
    });

    this.nodesDataset.add(nodesToAdd);
    this.edgesDataset.add(edgesToAdd);
  }

  updateNodeInTopology(ip: GridBox) {
    if (!this.nodesDataset) return;
    
    if (ip.status === 'free') {
       if (this.nodesDataset.get(ip.address)) {
          this.nodesDataset.remove(ip.address);
       }
       return;
    }

    let nodeColor = ip.status === 'alive' ? '#0ab39c' : '#f06548';
    if (ip.isLocal) {
        nodeColor = '#8a2be2'; // Púrpura para el servidor local
    }
    
    const displayUser = (ip.user === 'unknown' || ip.user === 'Desconocido' || ip.user === 'Sin nombre') ? '' : ip.user;
    const labelText = displayUser ? `${displayUser}\n${ip.address}` : ip.address;
    const existingNode = this.nodesDataset.get(ip.address);

    if (existingNode) {
      this.nodesDataset.update({
        id: ip.address,
        label: labelText,
        color: { background: nodeColor, border: '#ffffff' },
        gridBox: ip
      });
      // Ensure edge has correct color
      const edges = this.networkInstance.getConnectedEdges(ip.address);
      if (edges && edges.length > 0) {
         this.edgesDataset.update({ id: edges[0], color: { color: nodeColor } });
      }
    } else {
      this.nodesDataset.add({
        id: ip.address,
        label: labelText,
        color: { background: nodeColor, border: '#ffffff' },
        gridBox: ip
      });
      this.edgesDataset.add({
        from: 'router',
        to: ip.address,
        color: { color: nodeColor }
      });
    }

    // Efecto visual "Sonar Glow" en el canvas
    if (ip.pulsing && ip.status === 'alive') {
       this.nodesDataset.update({
          id: ip.address,
          size: 26, // Crece temporalmente
          shadow: { color: '#0ab39c', size: 30, x: 0, y: 0 } // Brillo intenso
       });
       
       setTimeout(() => {
          if (this.nodesDataset && this.nodesDataset.get(ip.address)) {
             this.nodesDataset.update({
                id: ip.address,
                size: 16, // Vuelve a su tamaño original
                shadow: true
             });
          }
       }, 1000); // El pulso dura 1 segundo
    }
  }

  private updateCountdown() {
    if (!this.nextScanAt || this.isScanning) {
      this.countdownStr = '';
      return;
    }
    const now = new Date().getTime();
    const target = this.nextScanAt.getTime();
    const diff = target - now;

    if (diff <= 0) {
      this.countdownStr = '00:00';
    } else {
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      this.countdownStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
  }

  loadNetworks() {
    this.networksService.getNetworks().subscribe({
      next: (res) => {
        this.networks = res.data;
        if (this.networks.length > 0) {
          this.selectedNetworkId = this.networks[0].id;
          this.onNetworkChange();
        }
      },
      error: (err) => console.error('Error cargando redes', err)
    });
  }

  onNetworkChange() {
    if (!this.selectedNetworkId || this.selectedNetworkId.toString() === 'null') return;
    
    this.selectedNetwork = this.networks.find(n => n.id == this.selectedNetworkId) || null;
    this.generateBaseGrid();
    
    // Cargar los datos iniciales por HTTP
    this.loadRealDevices();

    // Conectar al WebSocket de esta red (esto disparará el modo ACTIVE en backend)
    this.wsService.connect(this.selectedNetworkId);
  }

  ipToLong(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  longToIp(long: number): string {
    return [
      (long >>> 24) & 255,
      (long >>> 16) & 255,
      (long >>> 8) & 255,
      long & 255
    ].join('.');
  }

  // Genera las IPs vacías dinámicamente basadas en la máscara CIDR (ej. /26 = 62 hosts)
  generateBaseGrid() {
    this.gridIps = [];
    if (!this.selectedNetwork) return;

    const parts = this.selectedNetwork.cidr.split('/');
    const ipStr = parts[0];
    const prefix = parseInt(parts[1], 10) || 24;

    const ipLong = this.ipToLong(ipStr);
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    
    const networkLong = (ipLong & mask) >>> 0;
    const broadcastLong = (networkLong | ~mask) >>> 0;

    // IPs usables excluyen la de red y el broadcast
    const startIp = networkLong + 1;
    const endIp = broadcastLong - 1;

    for (let i = startIp; i <= endIp; i++) {
      const address = this.longToIp(i);
      // Extraemos el último octeto de la IP para mostrarlo bonito en la caja (id visual)
      const lastOctet = parseInt(address.split('.').pop() || '0', 10);
      
      this.gridIps.push({
        id: lastOctet,
        address: address,
        status: 'free',
        statusLabel: 'Libre (No vista)',
        user: 'Desconocido'
      });
    }
  }

  loadRealDevices() {
    if (!this.selectedNetworkId) return;
    
    this.devicesService.getNetworkDevices(this.selectedNetworkId).subscribe({
      next: (res) => {
        this.mergeDevicesIntoGrid(res.devices);
      },
      error: (err) => console.error('Error cargando dispositivos', err)
    });
  }

  mergeDevicesIntoGrid(devices: Device[]) {
    // Reset status but keep the IPs
    this.gridIps.forEach(box => {
      box.status = 'free';
      box.statusLabel = 'Libre (No vista)';
      box.user = 'Desconocido';
      box.os = undefined;
      box.vendor = undefined;
    });

    // Map real devices
    devices.forEach(device => {
      // Buscar directamente por dirección IP exacta
      const box = this.gridIps.find(b => b.address === device.ip);
      
      if (box) {
        if (device.is_alive) {
          box.status = 'alive';
          box.statusLabel = 'Online';
        } else {
          box.status = 'down';
          box.statusLabel = 'Caído / Offline';
        }
        
        box.user = device.hostname || device.mac_address || 'Sin nombre';
        
        // Propiedades de Fingerprinting dinámicas desde WS o Caché
        const cache = this.getFromLocalCache(device.ip);
        
        box.os = (device as any).os || cache?.os;
        box.vendor = (device as any).vendor || cache?.vendor;
        box.isLocal = (device as any).is_local !== undefined ? (device as any).is_local : cache?.isLocal;

        // Si vinieron datos frescos del WS, actualizar la caché
        if ((device as any).os || (device as any).vendor) {
           this.saveToLocalCache(device.ip, {
              os: box.os,
              vendor: box.vendor,
              isLocal: box.isLocal
           });
        }

        if (device.open_ports && device.open_ports.length > 0) {
          box.openPorts = device.open_ports.join(', ');
        } else {
          box.openPorts = undefined;
        }
      }
    });
    
    // Sincronizar topología
    this.buildTopologyFromGrid();
  }

  triggerScan() {
    if (!this.selectedNetworkId || this.isScanning) return;
    
    this.isScanning = true;
    console.log('Iniciando scan manual en backend...');
    
    this.networksService.triggerScan(this.selectedNetworkId).subscribe({
      next: () => {
        // Ya no hacemos polling manual.
        // El WebSocket empujará los datos cuando el backend termine de escanear.
      },
      error: (err) => {
        console.error('Error disparando scan', err);
        this.isScanning = false;
      }
    });
  }

  // --- Helpers de Caché Local ---
  private getCacheKey(ip: string): string {
    return `scann_device_cache_${ip}`;
  }

  private saveToLocalCache(ip: string, data: any) {
    try {
      localStorage.setItem(this.getCacheKey(ip), JSON.stringify(data));
    } catch (e) {
      console.warn('No se pudo guardar en localStorage', e);
    }
  }

  private getFromLocalCache(ip: string): any {
    try {
      const item = localStorage.getItem(this.getCacheKey(ip));
      return item ? JSON.parse(item) : null;
    } catch (e) {
      return null;
    }
  }
}
