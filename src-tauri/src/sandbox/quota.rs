//! 算力预算守卫 (Quota Guardian)
//! 严格防范批量调用外部大模型或视频生成 API 导致的高额账单。超预算强制挂起并要求人工审批。

use std::sync::atomic::{AtomicU32, Ordering};
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QuotaEstimate {
    pub estimated_cost_cents: u32,
    pub remaining_daily_budget_cents: u32,
    pub requires_approval: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct QuotaStatus {
    pub daily_budget_cents: u32,
    pub consumed_today_cents: u32,
    pub remaining_budget_cents: u32,
}

pub struct QuotaGuardian {
    daily_budget_cents: u32,
    consumed_today_cents: AtomicU32,
}

impl QuotaGuardian {
    pub fn new(daily_budget_cents: u32) -> Self {
        Self {
            daily_budget_cents,
            consumed_today_cents: AtomicU32::new(0),
        }
    }

    /// 评估即将发生的算力调用成本
    pub fn estimate(&self, estimated_cents: u32, task_desc: &str) -> QuotaEstimate {
        let consumed = self.consumed_today_cents.load(Ordering::SeqCst);
        let remaining = if self.daily_budget_cents > consumed {
            self.daily_budget_cents - consumed
        } else {
            0
        };

        if estimated_cents > remaining {
            QuotaEstimate {
                estimated_cost_cents: estimated_cents,
                remaining_daily_budget_cents: remaining,
                requires_approval: true,
                reason: format!(
                    "预估消耗 {} 美分，超出今日剩余预算 {} 美分。已触发零资源挂起门禁，请审批：{}",
                    estimated_cents, remaining, task_desc
                ),
            }
        } else {
            QuotaEstimate {
                estimated_cost_cents: estimated_cents,
                remaining_daily_budget_cents: remaining,
                requires_approval: false,
                reason: "在今日安全预算限额内，允许自动执行".to_string(),
            }
        }
    }

    /// 真实扣减记账
    pub fn record_consumption(&self, cents: u32) {
        self.consumed_today_cents.fetch_add(cents, Ordering::SeqCst);
    }

    /// 获取当前预算使用状态
    pub fn get_status(&self) -> QuotaStatus {
        let consumed = self.consumed_today_cents.load(Ordering::SeqCst);
        let remaining = if self.daily_budget_cents > consumed {
            self.daily_budget_cents - consumed
        } else {
            0
        };

        QuotaStatus {
            daily_budget_cents: self.daily_budget_cents,
            consumed_today_cents: consumed,
            remaining_budget_cents: remaining,
        }
    }
}
