export interface Network {
  id: number;
  cidr: string;
  vlan_id?: number;
  vlan_name?: string;
  scan_interval_minutes?: number;
  scan_interval?: number;
  is_active?: boolean;
  expected_check_in?: string | null;
  expected_check_out?: string | null;
  tolerance_minutes?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateNetworkDto {
  cidr: string;
  vlan_id?: number;
  scan_interval_minutes?: number;
  is_active?: boolean;
}

export interface UpdateNetworkDto {
  vlan_id?: number;
  scan_interval_minutes?: number;
  is_active?: boolean;
}
