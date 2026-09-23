import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuditConfigUpdate {
  audit_enabled: boolean;
  employee_name: string;
}

export interface DisconnectionBlock {
  start: string;
  end: string;
  duration_seconds: number;
  formatted_duration: string;
  is_ongoing?: boolean;
}

export interface AuditHistoryRecord {
  date: string;
  first_online: string | null;
  last_offline: string | null;
  total_worked_hours: number;
  total_seconds?: number;
  is_active_now?: boolean;
  formatted_time: string;
  status: string; // "Puntual", "Tarde", "Ausente"
  disconnections?: DisconnectionBlock[];
}

export interface DeviceAuditResponse {
  device: {
    id: number;
    ip: string;
    hostname: string;
    audit_enabled: boolean;
    employee_name: string;
    expected_check_in: string | null;
    expected_check_out: string | null;
    tolerance_minutes: number;
  };
  history: AuditHistoryRecord[];
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private apiUrl = `${environment.apiUrl}/audit`;

  constructor(private http: HttpClient) { }

  /**
   * Obtiene el historial de asistencia calculado para un dispositivo
   * @param deviceId ID del dispositivo
   */
  getDeviceAuditHistory(deviceId: number): Observable<DeviceAuditResponse> {
    return this.http.get<DeviceAuditResponse>(`${this.apiUrl}/device/${deviceId}`);
  }

  /**
   * Actualiza si se audita o no, y el nombre del empleado asignado
   * @param deviceId ID del dispositivo
   * @param config Objeto con audit_enabled y employee_name
   */
  updateAuditConfig(deviceId: number, config: AuditConfigUpdate): Observable<{status: string, message: string}> {
    return this.http.put<{status: string, message: string}>(`${this.apiUrl}/devices/${deviceId}/config`, config);
  }
}
