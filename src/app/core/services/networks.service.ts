import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Network, CreateNetworkDto, UpdateNetworkDto } from '../models/network.model';
import { PaginatedNetworks } from '../models/common.model';

@Injectable({
  providedIn: 'root'
})
export class NetworksService {
  private apiUrl = `${environment.apiUrl}/networks`;

  constructor(private http: HttpClient) { }

  getNetworks(): Observable<PaginatedNetworks<Network>> {
    return this.http.get<PaginatedNetworks<Network>>(this.apiUrl);
  }

  getNetwork(id: number): Observable<Network> {
    return this.http.get<Network>(`${this.apiUrl}/${id}`);
  }

  createNetwork(data: CreateNetworkDto): Observable<Network> {
    return this.http.post<Network>(this.apiUrl, data);
  }

  updateNetwork(id: number, data: UpdateNetworkDto): Observable<Network> {
    return this.http.patch<Network>(`${this.apiUrl}/${id}`, data);
  }

  deleteNetwork(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  triggerScan(id: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/scan`, {});
  }

  getNetworkScans(id: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/scans`);
  }

  updateAuditConfig(id: number, data: { expected_check_in: string, expected_check_out: string, tolerance_minutes: number }): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/audit-config`, data);
  }

  bulkSetStatus(networkIds: number[], isActive: boolean): Observable<any> {
    return this.http.put(`${this.apiUrl}/bulk/status`, {
      network_ids: networkIds,
      is_active: isActive
    });
  }
}
