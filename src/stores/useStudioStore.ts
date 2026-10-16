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

interface StudioState {
  daemonStatus: DaemonStatus | null;
  assets: AssetMetadata[];
  selectedAsset: AssetMetadata | null;
  turnSteerInput: string;
  quotaEstimate: QuotaEstimate | null;
  checkpoints: CheckpointRecord[];

  setTurnSteerInput: (input: string) => void;
  setSelectedAsset: (asset: AssetMetadata | null) => void;
  fetchDaemonStatus: () => Promise<void>;
  fetchAssets: () => Promise<void>;
  registerAsset: (filePath: string, mediaType: string, name: string) => Promise<AssetMetadata | null>;
  generateSound: (soundType: SoundEffectType) => Promise<AssetMetadata | null>;
  exportCapCut: (draftName: string, clips: CapCutClipInput[]) => Promise<CapCutExportResult | null>;
  checkQuota: (cents: number, desc: string) => Promise<QuotaEstimate | null>;
  fetchCheckpoints: () => Promise<void>;
  createCheckpoint: (stepName: string, stateJson: string) => Promise<string | null>;
}

export const useStudioStore = create<StudioState>((set) => ({
  daemonStatus: null,
  assets: [],
  selectedAsset: null,
  turnSteerInput: '',
  quotaEstimate: null,
  checkpoints: [],

  setTurnSteerInput: (turnSteerInput) => set({ turnSteerInput }),
  setSelectedAsset: (selectedAsset) => set({ selectedAsset }),

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
    const res = await commands.registerLocalAsset(filePath, mediaType, name, '通过桌面控制台导入');
    if (res.status === 'ok') {
      const newAsset = res.data;
      set((state) => ({ assets: [newAsset, ...state.assets] }));
      return newAsset;
    }
    return null;
  },

  generateSound: async (soundType) => {
    const res = await commands.generateProceduralSound(soundType, null);
    if (res.status === 'ok') {
      const newAsset = res.data;
      set((state) => ({ assets: [newAsset, ...state.assets] }));
      return newAsset;
    }
    return null;
  },

  exportCapCut: async (draftName, clips) => {
    const res = await commands.exportCapcutProject(draftName, clips);
    if (res.status === 'ok') {
      return res.data;
    }
    return null;
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
}));
