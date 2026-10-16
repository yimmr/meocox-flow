import { create } from 'zustand';
import {
  commands,
  type AssetMetadata,
  type DaemonStatus,
  type SoundEffectType,
  type CapCutClipInput,
  type CapCutExportResult,
  type QuotaEstimate,
  type CheckpointRecord,
} from '@/bindings';
import {
  type DirectorMessage,
  type DirectorCardData,
  type StoryboardCardPayload,
  type StyleCardPayload,
  type QuotaCardPayload,
  type TurnSteerPayload,
} from '@/types/director';

interface StudioState {
  // 守护进程与系统
  daemonStatus: DaemonStatus | null;
  // 媒体资产
  assets: AssetMetadata[];
  selectedAsset: AssetMetadata | null;
  activeArtifactTab: 'visual' | 'audio' | 'capcut';
  capcutExportResult: CapCutExportResult | null;
  isExportingCapCut: boolean;
  // 时光机检查点
  checkpoints: CheckpointRecord[];
  // 算力守卫
  quotaEstimate: QuotaEstimate | null;
  // 布局控制
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  // 对话流与 TurnSteer
  messages: DirectorMessage[];
  isGenerating: boolean;
  turnSteerInput: string;

  // Actions
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
  setSelectedAsset: (asset: AssetMetadata | null) => void;
  setActiveArtifactTab: (tab: 'visual' | 'audio' | 'capcut') => void;
  setTurnSteerInput: (input: string) => void;

  // 后端交互
  fetchDaemonStatus: () => Promise<void>;
  fetchAssets: () => Promise<void>;
  registerAsset: (filePath: string, mediaType: string, name: string) => Promise<AssetMetadata | null>;
  generateSound: (soundType: SoundEffectType) => Promise<AssetMetadata | null>;
  exportCapCut: (draftName: string, clips: CapCutClipInput[]) => Promise<CapCutExportResult | null>;
  checkQuota: (cents: number, desc: string) => Promise<QuotaEstimate | null>;
  fetchCheckpoints: () => Promise<void>;
  createCheckpoint: (stepName: string, stateJson: string) => Promise<string | null>;

  // 对话与动态切轨
  sendMessage: (content: string, attachedAssets?: AssetMetadata[]) => Promise<void>;
  dispatchTurnSteer: (instruction: string) => Promise<void>;
  resolveCardAction: (messageId: string, updatedCard: DirectorCardData) => void;
}

const initialSeedMessages: DirectorMessage[] = [
  {
    id: 'msg_welcome',
    role: 'assistant',
    content: '导演您好！我是 Meocox Flow AIGC 创意中枢。当前工程底座已挂载 SQLite WAL 媒体池、16-bit PCM 原生免版税音效生成器与剪映 CapCut Pro 工业级组装引擎。我已为您预先推导了本次短片的镜头构思与风格建议，请在下方声明式卡片中拍板决策：',
    timestamp: Date.now() - 60000,
    card: {
      type: 'storyboard_confirm',
      title: '赛博纪元：第 01 幕 视觉概念分镜方案',
      total_duration_sec: 12.5,
      status: 'pending',
      scenes: [
        {
          id: 'sc_01',
          scene_num: 1,
          shot_type: '俯瞰 (Bird-Eye)',
          camera_movement: '推镜 (Push-In)',
          prompt: '雨夜赛博都市俯视全景，雨丝划过全息霓虹广告牌，潮湿反光街道',
          duration_sec: 3.5,
          audio_cue: 'Lo-Fi 科技背景音乐渐入',
        },
        {
          id: 'sc_02',
          scene_num: 2,
          shot_type: '特写 (Close-Up)',
          camera_movement: '静止 (Static)',
          prompt: '机械仿生人眼部义体瞳孔聚焦，极客微光流转，细雨凝结于冷金属面庞',
          duration_sec: 4.0,
          audio_cue: 'Whoosh 电流微啸转场',
        },
        {
          id: 'sc_03',
          scene_num: 3,
          shot_type: '中景 (Medium)',
          camera_movement: '移镜 (Tracking)',
          prompt: '仿生人披上磨损战术风衣，在废弃立交桥边缘起步奔跑，粒子气流激荡',
          duration_sec: 5.0,
          audio_cue: '节奏重低音与雨声环境',
        },
      ],
    } as StoryboardCardPayload,
  },
  {
    id: 'msg_style',
    role: 'assistant',
    content: '此外，为了确保后续 Diffusion 与 Video 生成管线的连贯性，请确认整片基调主风格：',
    timestamp: Date.now() - 40000,
    card: {
      type: 'style_selection',
      title: '视觉风格与调色基调',
      status: 'pending',
      selected_style_id: 'style_cyberpunk',
      options: [
        {
          id: 'style_cyberpunk',
          name: '赛博霓虹 (Cyberpunk Neo-Noir)',
          description: '青蓝与品红高反差对比，浓烈胶片暗角与雨夜光斑',
          accent_color: 'from-cyan-500 to-fuchsia-500',
          badge: '推荐 · 契合当前剧本',
        },
        {
          id: 'style_cinematic_real',
          name: '35mm 胶片写实 (Cinematic 35mm)',
          description: '柯达 Kodak 250D 真实颗粒质感，柔和漫射光影',
          accent_color: 'from-amber-600 to-orange-400',
          badge: '大师质感',
        },
        {
          id: 'style_retro_anime',
          name: '80s 复古日漫 (Retro Anime)',
          description: '手绘赛璐珞粗线条，赛璐珞上色与星芒高光',
          accent_color: 'from-pink-500 to-indigo-500',
          badge: '风格化强烈',
        },
        {
          id: 'style_hyper_3d',
          name: '极客写实 3D (Octane Realism)',
          description: '物理级着色器光线追踪，高精度微表面机械材质',
          accent_color: 'from-blue-600 to-emerald-400',
          badge: '高算力消耗',
        },
      ],
    } as StyleCardPayload,
  },
];

export const useStudioStore = create<StudioState>((set, get) => ({
  daemonStatus: null,
  assets: [],
  selectedAsset: null,
  activeArtifactTab: 'visual',
  capcutExportResult: null,
  isExportingCapCut: false,
  checkpoints: [],
  quotaEstimate: null,
  isLeftSidebarOpen: true,
  isRightSidebarOpen: true,
  leftWidth: 280,
  rightWidth: 380,
  messages: initialSeedMessages,
  isGenerating: false,
  turnSteerInput: '',

  toggleLeftSidebar: () => set((state) => ({ isLeftSidebarOpen: !state.isLeftSidebarOpen })),
  toggleRightSidebar: () => set((state) => ({ isRightSidebarOpen: !state.isRightSidebarOpen })),
  setLeftWidth: (leftWidth) => set({ leftWidth }),
  setRightWidth: (rightWidth) => set({ rightWidth }),
  setSelectedAsset: (selectedAsset) => set({ selectedAsset }),
  setActiveArtifactTab: (activeArtifactTab) => set({ activeArtifactTab }),
  setTurnSteerInput: (turnSteerInput) => set({ turnSteerInput }),

  fetchDaemonStatus: async () => {
    const res = await commands.pingDaemonStatus();
    if (res.status === 'ok') {
      set({ daemonStatus: res.data });
    }
  },

  fetchAssets: async () => {
    const res = await commands.listAssets();
    if (res.status === 'ok') {
      set({ assets: res.data });
    }
  },

  registerAsset: async (filePath, mediaType, name) => {
    const res = await commands.registerLocalAsset(filePath, mediaType, name, '通过导演控制台导入');
    if (res.status === 'ok') {
      const newAsset = res.data;
      set((state) => ({
        assets: [newAsset, ...state.assets],
        selectedAsset: newAsset,
      }));
      return newAsset;
    }
    return null;
  },

  generateSound: async (soundType) => {
    const res = await commands.generateProceduralSound(soundType, null);
    if (res.status === 'ok') {
      const newAsset = res.data;
      set((state) => ({
        assets: [newAsset, ...state.assets],
        selectedAsset: newAsset,
        activeArtifactTab: 'audio',
      }));
      return newAsset;
    }
    return null;
  },

  exportCapCut: async (draftName, clips) => {
    set({ isExportingCapCut: true });
    try {
      const res = await commands.exportCapcutProject(draftName, clips);
      if (res.status === 'ok') {
        set({ capcutExportResult: res.data, activeArtifactTab: 'capcut' });
        return res.data;
      }
      return null;
    } finally {
      set({ isExportingCapCut: false });
    }
  },

  checkQuota: async (cents, desc) => {
    const res = await commands.estimateQuota(cents, desc);
    if (res.status === 'ok') {
      set({ quotaEstimate: res.data });
      return res.data;
    }
    return null;
  },

  fetchCheckpoints: async () => {
    const res = await commands.listStudioCheckpoints();
    if (res.status === 'ok') {
      set({ checkpoints: res.data });
    }
  },

  createCheckpoint: async (stepName, stateJson) => {
    const res = await commands.saveStudioCheckpoint(stepName, stateJson);
    if (res.status === 'ok') {
      const checkpointId = res.data;
      const listRes = await commands.listStudioCheckpoints();
      if (listRes.status === 'ok') {
        set({ checkpoints: listRes.data });
      }
      return checkpointId;
    }
    return null;
  },

  sendMessage: async (content: string, attachedAssets?: AssetMetadata[]) => {
    if (!content.trim()) return;

    const userMsg: DirectorMessage = {
      id: `msg_u_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      attached_assets: attachedAssets,
    };

    set((state) => ({
      messages: [...state.messages, userMsg],
      isGenerating: true,
    }));

    // 智能体推演响应与自动触发算力核算门禁
    setTimeout(async () => {
      // 模拟调用 Rust QuotaGuardian 评估一个高算力任务
      const quota = await get().checkQuota(350, '多模态 4K 分镜超分辨率扩散重绘');

      const assistantMsg: DirectorMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: `已收到指令：“${content}”。根据剧本与镜头规划，正在准备批量调用多模态神经渲染管线。该操作已触发 QuotaGuardian 预算门禁，请审批：`,
        timestamp: Date.now(),
        card: quota
          ? ({
              type: 'quota_approval',
              task_desc: '4K 分镜超分辨率扩散重绘 (3 组镜头序列)',
              estimate: quota,
              status: quota.requires_approval ? 'pending' : 'approved',
            } as QuotaCardPayload)
          : undefined,
      };

      set((state) => ({
        messages: [...state.messages, assistantMsg],
        isGenerating: false,
      }));
    }, 800);
  },

  dispatchTurnSteer: async (instruction: string) => {
    if (!instruction.trim()) return;

    const payload: TurnSteerPayload = {
      session_id: 'session_current',
      steer_instruction: instruction,
      preserve_completed_scenes: true,
    };

    const steerMsg: DirectorMessage = {
      id: `msg_steer_${Date.now()}`,
      role: 'user',
      content: instruction,
      timestamp: Date.now(),
      is_turn_steer: true,
    };

    set((state) => ({
      messages: [...state.messages, steerMsg],
      turnSteerInput: '',
    }));

    // 保存时光机切轨检查点
    await get().createCheckpoint(
      `TurnSteer 切轨纠偏: ${instruction.slice(0, 15)}...`,
      JSON.stringify(payload)
    );

    // 智能体回显吸纳切轨确认
    setTimeout(() => {
      const ackMsg: DirectorMessage = {
        id: `msg_steer_ack_${Date.now()}`,
        role: 'assistant',
        content: `【TurnSteer 切轨控制帧已注入】已锁定并保全已生成的可用分镜资产。后续生成管线已成功吸纳新指令：“${instruction}”，状态机将在下一镜头帧平滑切入新设定！`,
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, ackMsg],
      }));
    }, 600);
  },

  resolveCardAction: (messageId: string, updatedCard: DirectorCardData) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, card: updatedCard } : m
      ),
    }));
  },
}));
