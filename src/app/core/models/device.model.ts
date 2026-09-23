import { DeviceInventory } from './device-inventory.model';

export interface Device {
    id: number;
    network_id: number;
    ip: string;
    mac_address: string | null;
    hostname: string | null;
    hostname_method: string | null;
    is_alive: boolean;
    is_critical?: boolean;
    os_guess?: string;
    first_seen_at: string;
    last_seen_at: string;
    open_ports?: number[];
    inventory?: DeviceInventory;
}

export interface CreateDeviceDto {
    network_id: number;
    ip: string;
    mac_address?: string;
    hostname?: string;
    hostname_method?: string;
    is_alive?: boolean;
    first_seen_at?: string;
    last_seen_at?: string;
}

export interface UpdateDeviceDto {
    network_id?: number;
    ip?: string;
    mac_address?: string;
    hostname?: string;
    hostname_method?: string;
    is_alive?: boolean;
    first_seen_at?: string;
    last_seen_at?: string;
}
