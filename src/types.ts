export interface Member {
  id: string; // NFC Tag ID or unique identifier
  name: string;
  whatsapp: string;
  nic: string;
  registeredAt: number;
}

export interface Session {
  id: string;
  memberId: string;
  memberName: string;
  checkIn: number;
  checkOut?: number;
  durationMinutes?: number;
  cost?: number;
}

export interface GymSettings {
  gymName: string;
  chargePerMinute: number;
}

export interface DailyStat {
  date: string;
  income: number;
  attendance: number;
}
