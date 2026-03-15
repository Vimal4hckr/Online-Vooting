export interface Option {
  id: string;
  poll_id: string;
  text: string;
  logo_url?: string;
}

export interface VoteCount {
  option_id: string;
  count: number;
}

export interface Poll {
  id: string;
  title: string;
  description: string;
  created_at: string;
  status: 'active' | 'closed';
  options: Option[];
  votes: VoteCount[];
}

export type ServerMessage = 
  | { type: 'INIT'; polls: Poll[] }
  | { type: 'UPDATE'; polls: Poll[] };
