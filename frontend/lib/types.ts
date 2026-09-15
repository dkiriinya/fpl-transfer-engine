// -- Types mirror Pydantic schemas in backend/main.py exactly --

export type ChipType = 'none' | 'wildcard' | 'freehit' | 'benchboost' | 'triplecaptain'

export interface PlayerRec {
  player_id: number
  web_name: string
  team: string
  position: 'GKP' | 'DEF' | 'MID' | 'FWD'
  price: number
  projected_points: number
  is_captain?: boolean
  is_vice_captain?: boolean
  is_starter?: boolean
  multiplier?: number
  photo?: string
}

export interface TransferDelta {
  out: PlayerRec
  in_: PlayerRec
  points_gain: number
  hit_cost: number
}

export interface ChipEvaluation {
  chip_id: ChipType
  chip_name: string
  description: string
  projected_points: number
  hit_penalty: number
  net_points: number
  points_gain_vs_standard: number
  transfers_made: number
  verdict: 'RECOMMENDED' | 'CONSIDER' | 'HOLD / SAVE' | 'STANDARD' | string
  reasoning: string
  transfers: TransferDelta[]
  final_squad: PlayerRec[]
  starting_xi: PlayerRec[]
  bench: PlayerRec[]
  captain: PlayerRec | null
  vice_captain: PlayerRec | null
  bank_remaining: number
}

export interface OptimizeRequest {
  team_id: number
  gameweek: number
  current_squad: number[]   // 15 FPL player element IDs
  bank: number              // budget in millions
  free_transfers: number    // 1 or 2
  wildcard_active?: boolean
  chip?: ChipType | string
  horizon?: number          // 1, 3, 5
}

export interface OptimizeResponse {
  status: string
  chip_active: string
  horizon?: number
  transfers: TransferDelta[]
  final_squad: PlayerRec[]
  starting_xi: PlayerRec[]
  bench: PlayerRec[]
  captain: PlayerRec | null
  vice_captain: PlayerRec | null
  total_projected_points: number
  transfers_made: number
  hit_penalty: number
  net_points: number
  bank_remaining: number
  chip_evaluations: ChipEvaluation[]
}

export interface FPLPick {
  element: number
  position: number
  multiplier: number
  is_captain: boolean
  is_vice_captain: boolean
}

export interface FPLSquadResponse {
  picks: FPLPick[]
  entry_history: {
    bank: number           // raw value — divide by 10 for millions
    event_transfers: number
    event_transfers_cost: number
    total_points: number
    points: number
  }
}

export interface BootstrapResponse {
  currentGameweek: number
  events?: Array<{
    id: number
    name: string
    finished: boolean
    is_current: boolean
    is_next: boolean
  }>
  playerPhotos: Record<number, string>
}
