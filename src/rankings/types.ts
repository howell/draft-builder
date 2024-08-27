import { ScoringType } from "@/platforms/PlatformApi";


export type SleeperScoringAdp = (ScoringType & ('ppr' | 'half-ppr')) | 'sf';
