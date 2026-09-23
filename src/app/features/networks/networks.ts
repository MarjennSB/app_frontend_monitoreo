import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworksService } from '../../core/services/networks.service';
import { VlansService } from '../../core/services/vlans.service';
import { Network } from '../../core/models/network.model';
import { Vlan } from '../../core/models/vlan.model';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';

declare const bootstrap: any;

@Component({
  selector: 'app-networks',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './networks.html',
  styleUrls: ['./networks.css']
})
export class Networks implements OnInit {
  private networksService = inject(NetworksService);
  private vlansService = inject(VlansService);
  private fb = inject(FormBuilder);

  networks: Network[] = [];
  vlans: Vlan[] = [];
  isLoading = true;

  // Pagination state
  currentPage = 1;
  totalPages = 1;
  totalItems = 0;

  selectedNetworkIds = signal<number[]>([]);

  isEditing = signal(false);
  editingId = signal<number | null>(null);
  errorMsg = signal<string | null>(null);
  successMsg = signal<string | null>(null);

  vlanErrorMsg = signal<string | null>(null);

  networkForm = this.fb.nonNullable.group({
    cidr: ['', [Validators.required]],
    vlan_id: [null as number | null, [Validators.required]],
    scan_interval_minutes: [5, [Validators.min(1)]],
    is_active: [true]
  });

  vlanForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: [''],
    is_active: [true]
  });

  auditForm = this.fb.nonNullable.group({
    expected_check_in: ['', [Validators.required]],
    expected_check_out: ['', [Validators.required]],
    tolerance_minutes: [15, [Validators.required, Validators.min(0), Validators.max(120)]]
  });
  currentAuditNetworkId: number | null = null;

  ngOnInit() {
    this.loadVlans();
    this.loadNetworks();
  }

  loadVlans() {
    this.vlansService.getVlans().subscribe({
      next: (response) => {
        this.vlans = response.data;
      },
      error: (err) => {
        console.error('Error cargando VLANs', err);
      }
    });
  }

  loadNetworks() {
    this.isLoading = true;
    this.networksService.getNetworks().subscribe({
      next: (response) => {
        this.networks = response.data;
        this.totalItems = response.meta.total;
        this.totalPages = response.meta.total_pages;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Error cargando redes', err);
        this.isLoading = false;
      }
    });
  }

  openCreateModal() {
    this.isEditing.set(false);
    this.editingId.set(null);
    this.networkForm.reset({
      cidr: '',
      vlan_id: null,
      scan_interval_minutes: 5,
      is_active: true
    });
    this.errorMsg.set(null);
    this.getModal('networkModal').show();
  }

  openEditModal(network: Network) {
    this.isEditing.set(true);
    this.editingId.set(network.id);
    this.networkForm.reset({
      cidr: network.cidr,
      vlan_id: network.vlan_id ?? null,
      scan_interval_minutes: network.scan_interval ? network.scan_interval / 60 : 5,
      is_active: network.is_active ?? true
    });
    this.errorMsg.set(null);
    this.getModal('networkModal').show();
  }

  saveNetwork() {
    if (this.networkForm.invalid) {
      this.networkForm.markAllAsTouched();
      return;
    }

    const formValue = this.networkForm.getRawValue();
    const data: any = { 
      ...formValue,
      scan_interval: formValue.scan_interval_minutes * 60 
    };

    if (this.isEditing() && this.editingId()) {
      const updateData = {
        cidr: data.cidr,
        vlan_id: data.vlan_id,
        scan_interval: data.scan_interval,
        is_active: data.is_active
      };
      
      this.networksService.updateNetwork(this.editingId()!, updateData).subscribe({
        next: () => {
          this.getModal('networkModal').hide();
          this.showSuccess('Red actualizada exitosamente.');
          this.loadNetworks();
        },
        error: (err) => {
          this.errorMsg.set(err?.error?.message || 'Error al actualizar la red.');
        }
      });
    } else {
      this.networksService.createNetwork(data).subscribe({
        next: () => {
          this.getModal('networkModal').hide();
          this.showSuccess('Red creada exitosamente.');
          this.loadNetworks();
        },
        error: (err) => {
          this.errorMsg.set(err?.error?.message || 'Error al crear la red.');
        }
      });
    }
  }

  // --- Asistencia ---

  openAuditModal(network: Network) {
    this.currentAuditNetworkId = network.id;
    this.auditForm.reset({
      expected_check_in: network.expected_check_in ? network.expected_check_in.substring(0, 5) : '08:00',
      expected_check_out: network.expected_check_out ? network.expected_check_out.substring(0, 5) : '17:00',
      tolerance_minutes: network.tolerance_minutes ?? 15
    });
    this.getModal('auditConfigModal').show();
  }

  closeAuditModal() {
    this.getModal('auditConfigModal').hide();
  }

  saveAuditConfig() {
    if (this.auditForm.invalid || !this.currentAuditNetworkId) {
      this.auditForm.markAllAsTouched();
      return;
    }

    const formValue = this.auditForm.getRawValue();
    this.networksService.updateAuditConfig(this.currentAuditNetworkId, formValue).subscribe({
      next: (res) => {
        this.getModal('auditConfigModal').hide();
        this.showSuccess('Configuración de asistencia guardada correctamente.');
        this.loadNetworks();
      },
      error: (err) => {
        console.error('Error guardando configuración de asistencia', err);
        alert('Error al guardar configuración de asistencia.');
      }
    });
  }

  isAuditFieldInvalid(field: string): boolean {
    const control = this.auditForm.get(field);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  // --- End Asistencia ---

  networkToDeleteId: number | null = null;

  deleteNetwork(id: number) {
    this.networkToDeleteId = id;
    this.getModal('deleteRecordModal').show();
  }

  confirmDelete() {
    if (this.networkToDeleteId !== null) {
      this.networksService.deleteNetwork(this.networkToDeleteId).subscribe({
        next: () => {
          this.getModal('deleteRecordModal').hide();
          this.showSuccess('Red eliminada exitosamente.');
          this.networkToDeleteId = null;
          this.loadNetworks();
        },
        error: (err) => {
          console.error('Error eliminando red', err);
          this.getModal('deleteRecordModal').hide();
          this.errorMsg.set('Error eliminando la red.');
          this.networkToDeleteId = null;
        }
      });
    }
  }

  toggleSelectAll(event: any) {
    if (event.target.checked) {
      this.selectedNetworkIds.set(this.networks.map(n => n.id));
    } else {
      this.selectedNetworkIds.set([]);
    }
  }

  toggleSelection(networkId: number, event: any) {
    const current = this.selectedNetworkIds();
    if (event.target.checked) {
      this.selectedNetworkIds.set([...current, networkId]);
    } else {
      this.selectedNetworkIds.set(current.filter(id => id !== networkId));
    }
  }

  pendingBulkAction: 'on' | 'off' | null = null;

  askBulkActionConfirm(actionType: 'on' | 'off') {
    this.pendingBulkAction = actionType;
    const modal = document.getElementById('networkBulkConfirmModal');
    if (modal) {
      if ((window as any).bootstrap) {
         (window as any).bootstrap.Modal.getOrCreateInstance(modal, { backdrop: false }).show();
      }
    }
  }

  executeBulkAction() {
    if (!this.pendingBulkAction) return;
    const actionType = this.pendingBulkAction;
    const ids = this.selectedNetworkIds();
    if (!ids.length) return;

    const isActive = actionType === 'on';
    this.networksService.bulkSetStatus(ids, isActive).subscribe({
      next: () => {
        this.showSuccess(`Redes ${isActive ? 'activadas' : 'desactivadas'} exitosamente.`);
        this.selectedNetworkIds.set([]);
        this.loadNetworks();
        const modal = document.getElementById('networkBulkConfirmModal');
        if (modal && (window as any).bootstrap) {
           (window as any).bootstrap.Modal.getInstance(modal)?.hide();
        }
      },
      error: (err) => {
        console.error('Error en bulk action', err);
        this.errorMsg.set('Error al actualizar las redes masivamente.');
      }
    });
  }

  toggleNetworkStatus(network: Network, event: any) {
    const originalState = network.is_active;
    const newState = event.target.checked;
    
    // Optimistic UI update
    network.is_active = newState;
    
    this.networksService.updateNetwork(network.id, { is_active: newState }).subscribe({
      next: () => {
        this.showSuccess(`Monitoreo ${newState ? 'activado' : 'pausado'} para ${network.cidr}.`);
      },
      error: (err) => {
        // Revert on error
        network.is_active = originalState;
        event.target.checked = originalState;
        this.errorMsg.set(err?.error?.message || 'Error al cambiar el estado de la red.');
      }
    });
  }

  // --- VLAN logic ---
  openCreateVlanModal() {
    this.vlanForm.reset({
      name: '',
      description: '',
      is_active: true
    });
    this.vlanErrorMsg.set(null);
    this.getModal('vlanModal').show();
  }

  closeCreateVlanModal() {
    this.getModal('vlanModal').hide();
  }

  saveVlan() {
    if (this.vlanForm.invalid) {
      this.vlanForm.markAllAsTouched();
      return;
    }
    const data = this.vlanForm.getRawValue();
    this.vlansService.createVlan(data).subscribe({
      next: (vlan) => {
        this.vlans.push(vlan);
        this.networkForm.patchValue({ vlan_id: vlan.id });
        this.showSuccess('VLAN creada y seleccionada exitosamente.');
        this.closeCreateVlanModal();
      },
      error: (err) => {
        this.vlanErrorMsg.set(err?.error?.message || 'Error al crear la VLAN.');
      }
    });
  }

  isFieldInvalid(field: string): boolean {
    const control = this.networkForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  isVlanFieldInvalid(field: string): boolean {
    const control = this.vlanForm.get(field);
    return !!(control && control.invalid && control.touched);
  }

  private showSuccess(msg: string): void {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3000);
  }

  private getModal(modalId: string): any {
    return bootstrap.Modal.getOrCreateInstance(document.getElementById(modalId));
  }
}
