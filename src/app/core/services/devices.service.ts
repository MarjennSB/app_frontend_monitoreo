import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Device } from '../models/device.model';
import { DeviceInventory } from '../models/device-inventory.model';
import { NetworkDevicesResponse } from '../models/common.model';

@Injectable({
  providedIn: 'root'
})
export class DevicesService {
  private baseApiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  getNetworkDevices(
    networkId: number | null, 
    status: string | null = null,
    isVip: boolean | null = null,
    osGuess: string | null = null,
    search: string | null = null,
    page: number = 1,
    limit: number = 0
  ): Observable<NetworkDevicesResponse<Device>> {
    let url = '';
    const params = new URLSearchParams();
    
    params.set('page', page.toString());
    if (limit > 0) params.set('limit', limit.toString());
    
    if (status) params.set('status', status);
    if (isVip !== null) params.set('is_vip', isVip.toString());
    if (osGuess) params.set('os_guess', osGuess);
    if (search) params.set('search', search);

    const queryParams = `?${params.toString()}`;
    
    if (networkId !== null) {
      url = `${this.baseApiUrl}/networks/${networkId}/devices${queryParams}`;
    } else {
      url = `${this.baseApiUrl}/devices${queryParams}`;
    }
    return this.http.get<NetworkDevicesResponse<Device>>(url);
  }

  getDevice(id: number): Observable<any> {
    const url = `${this.baseApiUrl}/devices/${id}`;
    return this.http.get<any>(url);
  }

  getDeviceInventory(deviceId: number): Observable<DeviceInventory> {
    const url = `${this.baseApiUrl}/devices/${deviceId}/inventory`;
    return this.http.get<DeviceInventory>(url);
  }

  getDeviceStats(deviceId: number): Observable<any> {
    const url = `${this.baseApiUrl}/devices/${deviceId}/stats`;
    return this.http.get<any>(url);
  }

  getDeviceMetrics(deviceId: number): Observable<any[]> {
    const url = `${this.baseApiUrl}/devices/${deviceId}/metrics`;
    return this.http.get<any[]>(url);
  }

  setDeviceVip(deviceId: number, isCritical: boolean): Observable<Device> {
    const url = `${this.baseApiUrl}/devices/${deviceId}/vip`;
    return this.http.put<Device>(url, { is_critical: isCritical });
  }

  syncInventoryFromSheets(): Observable<any> {
    const url = `${this.baseApiUrl}/inventory/sync-sheets`;
    return this.http.post<any>(url, {});
  }

  bulkSetDeviceVip(deviceIds: number[], isCritical: boolean): Observable<any> {
    const url = `${this.baseApiUrl}/devices/bulk/vip`;
    return this.http.put<any>(url, { device_ids: deviceIds, is_critical: isCritical });
  }
}
