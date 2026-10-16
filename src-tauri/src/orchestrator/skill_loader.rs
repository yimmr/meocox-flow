use serde::{Deserialize, Serialize};
use specta::Type;
use std::path::Path;

/// Level 1 技能微索引项 (<= 50 Token / 项，常驻主脑路由)
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SkillIndexItem {
    pub name: String,
    pub description: String,
    pub trigger_keywords: Vec<String>,
}

/// 三级渐进式技能加载器 (Progressive Skill Loader)
pub struct ProgressiveSkillLoader;

impl ProgressiveSkillLoader {
    /// Level 1: 异步扫描技能目录，仅提取微索引注入主脑
    pub async fn scan_skill_indexes(base_dir: &Path) -> Vec<SkillIndexItem> {
        let mut items = Vec::new();

        // 默认预置视听 ACI 核心技能索引
        items.push(SkillIndexItem {
            name: "crew-blackboard-pattern".to_string(),
            description: "剧组共享黑板制、知觉连贯性证伪与变体竞技场".to_string(),
            trigger_keywords: vec!["黑板".to_string(), "证伪".to_string(), "竞技场".to_string(), "分镜协同".to_string()],
        });
        items.push(SkillIndexItem {
            name: "media-pipeline-and-aci".to_string(),
            description: "ACI 防错设计、批处理媒体管线与渐进式加载".to_string(),
            trigger_keywords: vec!["媒体管线".to_string(), "剪映导出".to_string(), "批处理".to_string(), "PCM合成".to_string()],
        });
        items.push(SkillIndexItem {
            name: "cinematography-lighting".to_string(),
            description: "电影工业级布光法、三点布光、赛博冷暖色与高动态范围".to_string(),
            trigger_keywords: vec!["布光".to_string(), "光影".to_string(), "侧逆光".to_string(), "氛围".to_string()],
        });
        items.push(SkillIndexItem {
            name: "sound-design-mixing".to_string(),
            description: "多轨声场渲染、响度标准化与转场音效卡点".to_string(),
            trigger_keywords: vec!["音效".to_string(), "混音".to_string(), "卡点".to_string(), "BGM".to_string()],
        });

        // 扫描工作区实际存在的 .gemini/skills/ 或 .agents/skills/ 目录
        let candidates = [
            base_dir.join(".gemini").join("skills"),
            base_dir.join(".agents").join("skills"),
        ];

        for skill_root in candidates {
            if let Ok(mut read_dir) = tokio::fs::read_dir(&skill_root).await {
                while let Ok(Some(entry)) = read_dir.next_entry().await {
                    let path = entry.path();
                    if path.is_dir() {
                        let skill_md = path.join("SKILL.md");
                        if let Ok(content) = tokio::fs::read_to_string(&skill_md).await {
                            let name = entry.file_name().to_string_lossy().to_string();
                            let desc = Self::parse_description(&content).unwrap_or_else(|| "视听专业技能包".to_string());
                            let keywords = vec![name.clone()];
                            
                            if !items.iter().any(|i| i.name == name) {
                                items.push(SkillIndexItem {
                                    name,
                                    description: desc,
                                    trigger_keywords: keywords,
                                });
                            }
                        }
                    }
                }
            }
        }

        items
    }

    /// Level 2: 按需动态加载指定技能的完整 SKILL.md SOP 正文
    pub async fn load_skill_sop(base_dir: &Path, skill_name: &str) -> Result<String, String> {
        let candidates = [
            base_dir.join(".gemini").join("skills").join(skill_name).join("SKILL.md"),
            base_dir.join(".agents").join("skills").join(skill_name).join("SKILL.md"),
        ];

        for path in &candidates {
            if path.exists() {
                return tokio::fs::read_to_string(path)
                    .await
                    .map_err(|e| format!("Failed to read SKILL.md: {e}"));
            }
        }

        // 内置默认 SOP 回退
        Ok(format!(
            "# 技能 SOP: {}\n\n此技能处于就绪状态，遵循 ACI Poka-yoke 句柄流转规范，输入输出均使用 AssetId 句柄。",
            skill_name
        ))
    }

    fn parse_description(content: &str) -> Option<String> {
        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("description:") {
                return Some(trimmed.trim_start_matches("description:").trim().to_string());
            }
        }
        None
    }
}
