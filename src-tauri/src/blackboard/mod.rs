//! L3 剧组共享黑板 (Creative Blackboard)
//! 用于承载设定集、Scene DAG、OTIO 剪辑时间轴与 Continuity Falser 挑刺记录。

pub struct BlackboardState {
    pub project_name: String,
}

impl BlackboardState {
    pub fn new(name: impl Into<String>) -> Self {
        Self {
            project_name: name.into(),
        }
    }
}
