import { type QuotaEstimate, type CheckpointRecord, type AssetMetadata } from '@/bindings';

/**
 * 分镜镜头单元
 */
export interface StoryboardScene {
  id: string;
  scene_num: number;
  shot_type: '特写 (Close-Up)' | '中景 (Medium)' | '全景 (Wide)' | '俯瞰 (Bird-Eye)';
  camera_movement: '推镜 (Push-In)' | '摇镜 (Pan)' | '移镜 (Tracking)' | '静止 (Static)';
  prompt: string;
  duration_sec: number;
  preview_asset_id?: string;
  audio_cue?: string;
}

/**
 * 分镜卡片数据
 */
export interface StoryboardCardPayload {
  type: 'storyboard_confirm';
  title: string;
  scenes: StoryboardScene[];
  total_duration_sec: number;
  status: 'pending' | 'confirmed' | 'modifying';
  steering_notes?: string;
}

/**
 * 视觉风格选项
 */
export interface StyleOption {
  id: string;
  name: string;
  description: string;
  accent_color: string;
  badge: string;
}

/**
 * 视觉风格选择卡片数据
 */
export interface StyleCardPayload {
  type: 'style_selection';
  title: string;
  options: StyleOption[];
  selected_style_id?: string;
  status: 'pending' | 'confirmed';
}

/**
 * 算力预算审批卡片数据
 */
export interface QuotaCardPayload {
  type: 'quota_approval';
  task_desc: string;
  estimate: QuotaEstimate;
  status: 'pending' | 'approved' | 'rejected';
}

/**
 * 时光机检查点卡片数据
 */
export interface CheckpointCardPayload {
  type: 'checkpoint_restore';
  checkpoint: CheckpointRecord;
  status: 'snapshot' | 'restored';
}

/**
 * 声明式 A2UI 卡片联合类型
 */
export type DirectorCardData =
  | StoryboardCardPayload
  | StyleCardPayload
  | QuotaCardPayload
  | CheckpointCardPayload;

/**
 * 导演主对话流消息
 */
export interface DirectorMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  card?: DirectorCardData;
  is_turn_steer?: boolean;
  attached_assets?: AssetMetadata[];
}

/**
 * 生成中途动态切轨控制帧
 */
export interface TurnSteerPayload {
  session_id: string;
  steer_instruction: string;
  preserve_completed_scenes: boolean;
}
