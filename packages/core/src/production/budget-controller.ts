import { BudgetConfig, BudgetStatus } from '../domain/production.js';
import { StudioError } from '../errors/index.js';

export class BudgetController {
  private maxBudgetUsd: number;
  private spentBudgetUsd: number = 0.0;
  private warningThresholdPercent: number;
  private enforceHardCap: boolean;

  constructor(config: Partial<BudgetConfig> = {}) {
    this.maxBudgetUsd = config.maxBudgetUsd ?? 100.0;
    this.warningThresholdPercent = config.warningThresholdPercent ?? 80.0;
    this.enforceHardCap = config.enforceHardCap ?? true;
  }

  public getStatus(): BudgetStatus {
    const remaining = Math.max(0, this.maxBudgetUsd - this.spentBudgetUsd);
    const utilization = this.maxBudgetUsd > 0 ? (this.spentBudgetUsd / this.maxBudgetUsd) * 100 : 0;
    const isWarning = utilization >= this.warningThresholdPercent && utilization < 100;
    const isHardCapReached = this.spentBudgetUsd >= this.maxBudgetUsd;

    return {
      maxBudgetUsd: Number(this.maxBudgetUsd.toFixed(4)),
      spentBudgetUsd: Number(this.spentBudgetUsd.toFixed(4)),
      remainingBudgetUsd: Number(remaining.toFixed(4)),
      utilizationPercent: Number(utilization.toFixed(2)),
      isWarning,
      isHardCapReached,
    };
  }

  public canAfford(costUsd: number): boolean {
    if (!this.enforceHardCap) return true;
    return this.spentBudgetUsd + costUsd <= this.maxBudgetUsd;
  }

  public recordExpense(costUsd: number): BudgetStatus {
    if (this.enforceHardCap && this.spentBudgetUsd + costUsd > this.maxBudgetUsd) {
      throw new StudioError(
        `Budget exceeded: attempting to spend $${costUsd.toFixed(2)} with only $${(this.maxBudgetUsd - this.spentBudgetUsd).toFixed(2)} remaining out of $${this.maxBudgetUsd.toFixed(2)} cap`,
        'BUDGET_EXCEEDED'
      );
    }
    this.spentBudgetUsd += costUsd;
    return this.getStatus();
  }

  public reset(newCap?: number): void {
    this.spentBudgetUsd = 0.0;
    if (newCap !== undefined) {
      this.maxBudgetUsd = newCap;
    }
  }

  public setMaxBudget(cap: number): void {
    this.maxBudgetUsd = cap;
  }

  public setEnforceHardCap(enforce: boolean): void {
    this.enforceHardCap = enforce;
  }
}
