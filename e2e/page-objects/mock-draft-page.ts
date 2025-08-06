import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class MockDraftPage extends BasePage {
  readonly createDraftButton: Locator;
  readonly draftNameInput: Locator;
  readonly playerSearchInput: Locator;
  readonly playerTable: Locator;
  readonly rosterTable: Locator;
  readonly budgetDisplay: Locator;
  readonly saveButton: Locator;
  readonly positionFilter: Locator;
  readonly priceRangeMin: Locator;
  readonly priceRangeMax: Locator;

  constructor(page: Page) {
    super(page);
    this.createDraftButton = page.getByRole('button', { name: /create.*draft|new.*draft/i });
    this.draftNameInput = page.locator('input[placeholder*="Draft name"]');
    this.playerSearchInput = page.locator('input[placeholder*="Search player"]');
    this.playerTable = page.locator('table').first(); // Available players table
    this.rosterTable = page.locator('table').last(); // Your roster table
    this.budgetDisplay = page.getByTestId('budget-display');
    this.saveButton = page.getByRole('button', { name: /save/i });
    this.positionFilter = page.locator('select, [role="combobox"]').first();
    this.priceRangeMin = page.locator('input[type="number"]').first();
    this.priceRangeMax = page.locator('input[type="number"]').last();
  }

  async navigateToMockDrafts(leagueId: string) {
    await this.page.goto(`/league/${leagueId}/mocks`);
    await this.waitForLoad();
  }

  async createNewDraft(name: string) {
    await this.createDraftButton.click();
    await this.draftNameInput.fill(name);
    await this.saveButton.click();
    await this.waitForLoad();
  }

  async searchPlayer(playerName: string) {
    await this.playerSearchInput.fill(playerName);
    await this.page.waitForTimeout(500); // Debounce delay
  }

  async selectPlayer(playerName: string) {
    const playerRow = this.page.getByRole('row', { name: playerName });
    await playerRow.click();
  }

  async filterByPosition(position: string) {
    await this.positionFilter.selectOption(position);
    await this.page.waitForTimeout(300);
  }

  async setPriceRange(min: number, max: number) {
    await this.priceRangeMin.fill(min.toString());
    await this.priceRangeMax.fill(max.toString());
    await this.page.waitForTimeout(300);
  }

  async expectPlayerInRoster(playerName: string) {
    const rosterRow = this.rosterTable.getByRole('row', { name: playerName });
    await expect(rosterRow).toBeVisible();
  }

  async expectBudgetAmount(amount: number) {
    await expect(this.budgetDisplay).toContainText(amount.toString());
  }

  async saveDraft() {
    await this.saveButton.click();
    await expect(this.page.getByText(/saved/i)).toBeVisible();
  }

  async expectDraftSaved(draftName: string) {
    await this.page.goto('/league/*/mocks');
    await expect(this.page.getByText(draftName)).toBeVisible();
  }
}