import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import Chart from 'chart.js/auto';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DevicesService } from '../../core/services/devices.service';
import { NetworksService } from '../../core/services/networks.service';
import { WebsocketService } from '../../core/services/websocket.service';
import { Device } from '../../core/models/device.model';
import { Network } from '../../core/models/network.model';
import { AuditService, DeviceAuditResponse } from '../../core/services/audit.service';
import { Subscription } from 'rxjs';

declare const bootstrap: any;

@Component({
  selector: 'app-devices',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './devices.html',
  styleUrls: ['./devices.css']
})
export class Devices implements OnInit, OnDestroy {
  private devicesService = inject(DevicesService);
  private networksService = inject(NetworksService);
  private wsService = inject(WebsocketService);
  private auditService = inject(AuditService);

  networks: Network[] = [];
  selectedNetworkId: number | null = null;
  
  deviceMetrics: any[] = [];
  chartInstance: any = null;
  
  devices = signal<Device[]>([]);
  isLoading = true;
  isSyncing = false;
  totalItems = 0;
  currentPage = 1;
  pageSize = 15;
  totalPages = 1;
  
  private wsSubscription?: Subscription;
  private auditTimer: any = null;

  searchTerm = signal('');

  ngOnInit() {
    this.loadNetworks();
    this.setupWebSocket();
  }

  ngOnDestroy() {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
    this.stopAuditTimer();
  }

  setupWebSocket() {
    this.wsSubscription = this.wsService.onMessage().subscribe((msg: any) => {
      if (msg.type === 'inventory_sync_complete') {
        alert('¡Sincronización Completada!\n' + (msg.data.message || 'Inventario actualizado desde Google Sheets.'));
        this.loadDevices(); // Recargar la tabla
      }
    });
  }

  loadNetworks() {
    this.isLoading = true;
    this.networksService.getNetworks().subscribe({
      next: (res) => {
        this.networks = res.data;
        // Se puede seleccionar 'null' para ver todas por defecto
        this.selectedNetworkId = null; 
        this.loadDevices();
      },
      error: (err) => {
        console.error('Error loading networks', err);
        this.isLoading = false;
      }
    });
  }

  onNetworkChange() {
    this.currentPage = 1;
    this.loadDevices();
  }

  searchTimeout: any;

  onSearch(term: string) {
    this.searchTerm.set(term);
    this.currentPage = 1;
    
    // Debounce search
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.loadDevices();
    }, 500);
  }

  onSyncSheets() {
    this.isSyncing = true;
    this.devicesService.syncInventoryFromSheets().subscribe({
      next: (res) => {
        this.isSyncing = false;
        // La tabla se recargará automáticamente por el WebSocket, 
        // pero por si acaso, lanzamos la notificación.
        alert('¡Éxito!\n' + res.message);
        this.loadDevices();
      },
      error: (err) => {
        this.isSyncing = false;
        console.error('Error al sincronizar Google Sheets', err);
        alert('Error\nNo se pudo sincronizar el inventario.');
      }
    });
  }

  filterStatus = 'all';
  filterVip = 'all';
  filterOs = 'all';

  selectedDevice: any = null;
  isDeviceLoading = false;
  
  auditHistory: DeviceAuditResponse | null = null;
  isAuditLoading = false;

  onFilterChange() {
    this.currentPage = 1;
    this.loadDevices();
  }

  loadDevices() {
    this.isLoading = true;
    
    // Parse filters
    const status = this.filterStatus === 'all' ? null : this.filterStatus;
    const isVip = this.filterVip === 'all' ? null : this.filterVip === 'vip';
    const osGuess = this.filterOs === 'all' ? null : this.filterOs;
    const search = this.searchTerm() ? this.searchTerm() : null;

    this.devicesService.getNetworkDevices(
      this.selectedNetworkId, 
      status, 
      isVip, 
      osGuess, 
      search,
      this.currentPage, 
      this.pageSize
    ).subscribe({
      next: (res) => {
        this.devices.set(res.devices);
        this.totalItems = res.total;
        this.totalPages = Math.ceil(this.totalItems / this.pageSize) || 1;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error loading devices', err);
        this.isLoading = false;
      }
    });
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.loadDevices();
    }
  }

  get visiblePages(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  viewDevice(deviceId: number) {
    this.isDeviceLoading = true;
    
    // Abrir el offcanvas vacio/cargando
    const offcanvasEl = document.getElementById('deviceOffcanvas');
    if (offcanvasEl) {
      // @ts-ignore
      const bsOffcanvas = new bootstrap.Offcanvas(offcanvasEl);
      bsOffcanvas.show();
    }

    this.devicesService.getDevice(deviceId).subscribe({
      next: (res) => {
        this.selectedDevice = res;
        this.isDeviceLoading = false;
        
        // Fetch SNMP Metrics if VIP (or always)
        this.devicesService.getDeviceMetrics(deviceId).subscribe({
          next: (metrics) => {
            this.deviceMetrics = metrics;
            setTimeout(() => this.renderMetricsChart(), 200); // Wait for tab to be available
          },
          error: (err) => console.error('Error fetching metrics', err)
        });
      },
      error: (err) => {
        console.error('Error fetching device details', err);
        this.isDeviceLoading = false;
      }
    });
  }

  get openPorts() {
    if (!this.selectedDevice || !this.selectedDevice.ports) return [];
    return this.selectedDevice.ports.filter((p: any) => p.state === 'open');
  }

  renderMetricsChart() {
    const canvas = document.getElementById('snmpChart') as HTMLCanvasElement;
    if (!canvas) return;
    
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    const labels = this.deviceMetrics.map(m => {
      const d = new Date(m.timestamp);
      return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
    });

    const cpuData = this.deviceMetrics.map(m => m.cpu_usage_percent);
    const ramData = this.deviceMetrics.map(m => m.ram_usage_mb);
    
    this.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'CPU Usage (%)',
            data: cpuData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'RAM Usage (MB)',
            data: ramData,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            tension: 0.4,
            fill: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            min: 0,
            max: 100,
            title: { display: true, text: 'CPU (%)' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            min: 0,
            title: { display: true, text: 'RAM (MB)' },
            grid: { drawOnChartArea: false }
          }
        }
      }
    });
  }

  getServiceName(port: number): string {
    const knownPorts: { [key: number]: string } = {
      21: 'FTP',
      22: 'SSH',
      23: 'Telnet',
      25: 'SMTP',
      53: 'DNS',
      80: 'HTTP',
      110: 'POP3',
      143: 'IMAP',
      443: 'HTTPS',
      445: 'SMB',
      3306: 'MySQL',
      3389: 'RDP',
      5432: 'PostgreSQL',
      8080: 'HTTP-Alt',
      8443: 'HTTPS-Alt'
    };
    return knownPorts[port] || 'TCP';
  }

  toggleVipStatus(device: Device, event: any) {
    const isCritical = event.target.checked;
    this.devicesService.setDeviceVip(device.id, isCritical).subscribe({
      next: (updatedDevice) => {
        // Update device in the local list
        this.devices.update(devices => 
          devices.map(d => d.id === updatedDevice.id ? { ...d, is_critical: updatedDevice.is_critical } : d)
        );
        // Also update selectedDevice if it's currently selected
        if (this.selectedDevice && this.selectedDevice.id === updatedDevice.id) {
          this.selectedDevice.is_critical = updatedDevice.is_critical;
        }
      },
      error: (err) => {
        console.error('Error toggling VIP status', err);
        // Revert the checkbox on error
        event.target.checked = !isCritical;
      }
    });
  }

  // --- Bulk Actions ---
  selectedDeviceIds = signal<number[]>([]);

  toggleSelectAll(event: any) {
    const isChecked = event.target.checked;
    if (isChecked) {
      this.selectedDeviceIds.set(this.devices().map(d => d.id));
    } else {
      this.selectedDeviceIds.set([]);
    }
  }

  toggleSelection(deviceId: number, event: any) {
    const isChecked = event.target.checked;
    this.selectedDeviceIds.update(ids => {
      if (isChecked) {
        return [...ids, deviceId];
      } else {
        return ids.filter(id => id !== deviceId);
      }
    });
  }

  pendingBulkAction: 'vip_on' | 'vip_off' | null = null;

  askBulkActionConfirm(actionType: 'vip_on' | 'vip_off') {
    this.pendingBulkAction = actionType;
    const modal = document.getElementById('vipConfirmModal');
    if (modal) {
      if ((window as any).bootstrap) {
         (window as any).bootstrap.Modal.getOrCreateInstance(modal, { backdrop: false }).show();
      }
    }
  }

  executeBulkAction() {
    if (!this.pendingBulkAction) return;
    const actionType = this.pendingBulkAction;
    const ids = this.selectedDeviceIds();
    if (ids.length === 0) return;

    const isCritical = actionType === 'vip_on';
    
    this.isLoading = true;
    this.devicesService.bulkSetDeviceVip(ids, isCritical).subscribe({
      next: () => {
        this.selectedDeviceIds.set([]);
        this.loadDevices();
        const modal = document.getElementById('vipConfirmModal');
        if (modal && (window as any).bootstrap) {
           (window as any).bootstrap.Modal.getInstance(modal)?.hide();
        }
      },
      error: (err) => {
        console.error('Error updating VIP status', err);
        this.isLoading = false;
      }
    });
  }

  // --- Asistencia ---
  
  loadAuditHistory(deviceId: number | undefined) {
    if (!deviceId) return;
    this.isAuditLoading = true;
    this.stopAuditTimer();
    this.auditService.getDeviceAuditHistory(deviceId).subscribe({
      next: (res) => {
        this.auditHistory = res;
        this.isAuditLoading = false;
        this.startAuditTimer();
      },
      error: (err) => {
        console.error('Error loading audit history', err);
        this.isAuditLoading = false;
      }
    });
  }

  startAuditTimer() {
    if (!this.auditHistory) return;
    
    const hasActiveRecords = this.auditHistory.history.some(r => r.is_active_now);
    if (!hasActiveRecords) return;

    this.auditTimer = setInterval(() => {
      if (!this.auditHistory) return;
      let needsUpdate = false;
      this.auditHistory.history.forEach(record => {
        if (record.is_active_now && record.total_seconds !== undefined) {
          record.total_seconds++;
          record.formatted_time = this.formatSeconds(record.total_seconds);
          needsUpdate = true;
        }
      });
      // Force UI update if needed (not strictly required if object mutated, but safe)
      if (needsUpdate) {
        this.auditHistory = { ...this.auditHistory };
      }
    }, 1000);
  }

  stopAuditTimer() {
    if (this.auditTimer) {
      clearInterval(this.auditTimer);
      this.auditTimer = null;
    }
  }

  formatSeconds(totalSeconds: number): string {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }

  toggleAuditStatus(deviceId: number | undefined, event: any) {
    if (!deviceId) return;
    const isEnabled = event.target.checked;
    if (this.selectedDevice && this.selectedDevice.device) {
      this.selectedDevice.device.audit_enabled = isEnabled;
    }
  }

  saveAuditConfig(deviceId: number | undefined, employeeName: string, auditEnabled: boolean = false) {
    if (!deviceId) return;
    
    this.auditService.updateAuditConfig(deviceId, {
      audit_enabled: auditEnabled,
      employee_name: employeeName
    }).subscribe({
      next: (res) => {
        // Mostrar el modal de éxito en lugar del alert nativo
        const modal = document.getElementById('auditSuccessModal');
        const msgEl = document.getElementById('auditSuccessMessage');
        if (msgEl) msgEl.innerText = res.message;
        
        if (modal && (window as any).bootstrap) {
          (window as any).bootstrap.Modal.getOrCreateInstance(modal).show();
        }

        if (this.selectedDevice && this.selectedDevice.device) {
          this.selectedDevice.device.employee_name = employeeName;
          this.selectedDevice.device.audit_enabled = auditEnabled;
        }
        // Recargar el historial actual
        this.loadAuditHistory(deviceId);
      },
      error: (err) => {
        console.error('Error guardando config', err);
        alert('Error al guardar configuración');
      }
    });
  }
}
