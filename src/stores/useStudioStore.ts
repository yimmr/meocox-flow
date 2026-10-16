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
  type BlackboardState,
  type SkillIndexItem,
  type AestheticMemoryRecord,
  type StoryboardSceneNode,
} from '@/bindings';
import {
  type DirectorMessage,
  type DirectorCardData,
  type StoryboardCardPayload,
  type BattleCardPayload,
  type TurnSteerPayload,
} from '@/types/director';

export type ArtifactTabType = 'visual' | 'audio' | 'capcut' | 'blackboard' | 'falser' | 'memories';

interface StudioState {
  // 守护进程与系统
  daemonStatus: DaemonStatus | null;
  // 媒体资产
  assets: AssetMetadata[];
  selectedAsset: AssetMetadata | null;
  activeArtifactTab: ArtifactTabType;
  capcutExportResult: CapCutExportResult | null;
  isExportingCapCut: boolean;
  // 时光机检查点
  checkpoints: CheckpointRecord[];
  // 算力守卫
  quotaEstimate: QuotaEstimate | null;
  // 阶段四：剧组黑板与智能体生态
  blackboardState: BlackboardState | null;
  skillIndexes: SkillIndexItem[];
  aestheticMemories: AestheticMemoryRecord[];
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
  setActiveArtifactTab: (tab: ArtifactTabType) => void;
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

  // 阶段四：黑板编排、竞技场与审美记忆
  fetchBlackboardState: () => Promise<void>;
  orchestrateStoryboard: (prompt: string, styleId?: string) => Promise<void>;
  startPipelineExecution: (sceneIds: string[]) => Promise<void>;
  startBattleMode: (sceneId: string) => Promise<void>;
  resolveBattleWinner: (sceneId: string, winnerBranchId: string) => Promise<void>;
  verifySceneContinuity: (sceneId: string) => Promise<void>;
  fetchSkills: () => Promise<void>;
  fetchAestheticMemories: () => Promise<void>;
  distillAestheticMemory: () => Promise<void>;

  // 对话与动态切轨
  sendMessage: (content: string, attachedAssets?: AssetMetadata[]) => Promise<void>;
  dispatchTurnSteer: (instruction: string) => Promise<void>;
  resolveCardAction: (messageId: string, updatedCard: DirectorCardData) => void;
}

const initialSeedMessages: DirectorMessage[] = [
  {
    id: 'msg_welcome',
    role: 'assistant',
    content: '导演您好！我是 Meocox Flow 剧组智能体编排引擎。当前工作区已挂载 Rust 共享黑板 (Blackboard)、Continuity Falser 知觉证伪者、变体竞技场与渐进式技能加载器。我已将分镜 DAG 初始化至黑板，请在下方确认或开启 Battle Mode 盲测：',
    timestamp: Date.now() - 60000,
    card: {
      type: 'storyboard_confirm',
      title: '赛博纪元：第 01 幕 视觉概念分镜方案 (黑板已同步)',
      total_duration_sec: 10.5,
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
          status: 'Approved',
        },
        {
          id: 'sc_02',
          scene_num: 2,
          shot_type: '特写 (Close-Up)',
          camera_movement: '静止 (Static)',
          prompt: '机械仿生人眼部义体瞳孔聚焦，极客微光流转，细雨凝结于冷金属面庞',
          duration_sec: 4.0,
          audio_cue: 'Whoosh 电流微啸转场',
          status: 'Pending',
        },
        {
          id: 'sc_03',
          scene_num: 3,
          shot_type: '中景 (Medium)',
          camera_movement: '移镜 (Tracking)',
          prompt: '仿生人披上磨损战术风衣，在废弃立交桥边缘起步奔跑，粒子气流激荡',
          duration_sec: 3.0,
          audio_cue: 'Chime 转场与雨声环境',
          status: 'Pending',
        },
      ],
    } as StoryboardCardPayload,
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
  blackboardState: null,
  skillIndexes: [],
  aestheticMemories: [],
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

  fetchBlackboardState: async () => {
    const res = await commands.getBlackboardState();
    if (res.status === 'ok') {
      set({ blackboardState: res.data });
    }
  },

  orchestrateStoryboard: async (prompt, styleId) => {
    set({ isGenerating: true });
    try {
      const res = await commands.orchestrateStoryboard(prompt, styleId || null);
      if (res.status === 'ok') {
        set({ blackboardState: res.data });
      }
    } finally {
      set({ isGenerating: false });
    }
  },

  startPipelineExecution: async (sceneIds) => {
    set({ isGenerating: true });
    try {
      const res = await commands.startPipelineExecution(sceneIds);
      if (res.status === 'ok') {
        set({ blackboardState: res.data });
        await get().fetchAssets();
      }
    } finally {
      set({ isGenerating: false });
    }
  },

  startBattleMode: async (sceneId) => {
    const res = await commands.startBattleMode(sceneId);
    if (res.status === 'ok') {
      const bb = res.data;
      set({ blackboardState: bb });
      await get().fetchAssets();

      // 在对话流中动态生成 BattleCard A2UI 卡片供盲测
      const scn = bb.scene_dag.scenes.find((s: StoryboardSceneNode) => s.id === sceneId);
      if (scn && scn.battle_branches) {
        const battleCardMsg: DirectorMessage = {
          id: `msg_battle_${Date.now()}`,
          role: 'assistant',
          content: `已为重点分镜 #${scn.scene_num} 派生双美学分支。请在下方卡片中进行盲测拍板：`,
          timestamp: Date.now(),
          card: {
            type: 'battle_arena',
            scene_id: scn.id,
            scene_num: scn.scene_num,
            prompt: scn.prompt,
            branches: scn.battle_branches,
            status: 'pending',
          } as BattleCardPayload,
        };
        set((state) => ({ messages: [...state.messages, battleCardMsg] }));
      }
    }
  },

  resolveBattleWinner: async (sceneId, winnerBranchId) => {
    const res = await commands.resolveBattleWinner(sceneId, winnerBranchId);
    if (res.status === 'ok') {
      set({ blackboardState: res.data });
      // 触发跨会话审美记忆提炼
      await get().distillAestheticMemory();
    }
  },

  verifySceneContinuity: async (sceneId) => {
    const res = await commands.verifySceneContinuity(sceneId);
    if (res.status === 'ok') {
      await get().fetchBlackboardState();
    }
  },

  fetchSkills: async () => {
    const res = await commands.listSkillIndexes();
    if (res.status === 'ok') {
      set({ skillIndexes: res.data });
    }
  },

  fetchAestheticMemories: async () => {
    const res = await commands.listAestheticMemories();
    if (res.status === 'ok') {
      set({ aestheticMemories: res.data });
    }
  },

  distillAestheticMemory: async () => {
    const res = await commands.distillAndSaveAestheticMemory();
    if (res.status === 'ok') {
      set({ aestheticMemories: res.data });
    }
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

    // 调用 Rust Director 编排分镜 DAG 并初始化中央黑板
    const res = await commands.orchestrateStoryboard(content, null);
    if (res.status === 'ok') {
      const bb = res.data;
      set({ blackboardState: bb });

      const assistantMsg: DirectorMessage = {
        id: `msg_a_${Date.now()}`,
        role: 'assistant',
        content: `分镜编排已完成！剧组黑板已同步 ${bb.scene_dag.scenes.length} 幕镜头 DAG 拓扑。请审阅确认：`,
        timestamp: Date.now(),
        card: {
          type: 'storyboard_confirm',
          title: `分镜编排提案: ${content.slice(0, 15)}...`,
          total_duration_sec: bb.scene_dag.scenes.reduce((acc: number, s: StoryboardSceneNode) => acc + s.duration_sec, 0),
          status: 'pending',
          scenes: bb.scene_dag.scenes.map((s: StoryboardSceneNode) => ({
            id: s.id,
            scene_num: s.scene_num,
            shot_type: s.shot_type,
            camera_movement: s.camera_movement,
            prompt: s.prompt,
            duration_sec: s.duration_sec,
            status: s.status,
            retry_count: s.retry_count,
          })),
        } as StoryboardCardPayload,
      };

      set((state) => ({
        messages: [...state.messages, assistantMsg],
        isGenerating: false,
      }));
    } else {
      set({ isGenerating: false });
    }
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

    // 直连 Rust 端 inject_turn_steer_frame
    const res = await commands.injectTurnSteerFrame(payload);
    if (res.status === 'ok') {
      set({ blackboardState: res.data });
      await get().distillAestheticMemory();
    }

    // 智能体回显吸纳切轨确认
    setTimeout(() => {
      const ackMsg: DirectorMessage = {
        id: `msg_steer_ack_${Date.now()}`,
        role: 'assistant',
        content: `【TurnSteer 切轨控制帧已注入】黑板状态机已执行增量重排。已保全已完成镜头，未完成分镜已吸纳纠偏：“${instruction}”！`,
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, ackMsg],
      }));
    }, 400);
  },

  resolveCardAction: (messageId: string, updatedCard: DirectorCardData) => {
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, card: updatedCard } : m
      ),
    }));

    // 若确认了分镜卡片，触发 Rust 媒体管线执行
    if (updatedCard.type === 'storyboard_confirm' && updatedCard.status === 'confirmed') {
      const sceneIds = updatedCard.scenes.map((s) => s.id);
      get().startPipelineExecution(sceneIds);
    }
  },
}));
