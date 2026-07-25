import { Page, Locator } from '@playwright/test';
import { expect } from '../fixtures';
import { BasePage } from './base-page';
import { TEST_TIMEOUTS } from '../utils/test-constants';

export class MockDraftPage extends BasePage {
  readonly createDraftButton: Locator;
  readonly draftNameInput: Locator;
  readonly playerSearchInput: Locator;
  readonly playerTable: Locator;
  readonly rosterTable: Locator;
  readonly budgetDisplay: Locator;
  readonly saveButton: Locator;
  readonly priceRangeMin: Locator;
  readonly priceRangeMax: Locator;
  readonly positionNoneButton: Locator;

  constructor(page: Page) {
    super(page);
    this.createDraftButton = page.getByRole('button', { name: /create.*draft|new.*draft/i });
    this.draftNameInput = page.locator('input[placeholder*="Draft name"]');
    this.playerSearchInput = page.getByPlaceholder('Search for a player...').first();
    this.playerTable = page.locator('table').first(); // Available players table
    this.rosterTable = page.locator('table').last(); // Your roster table
    this.budgetDisplay = page.getByTestId('budget-display');
    this.saveButton = page.getByRole('button', { name: /save/i });
    this.priceRangeMin = page.locator('input[type="number"]').first();
    this.priceRangeMax = page.locator('input[type="number"]').last();
    this.positionNoneButton = page.getByRole('button', { name: 'None' });
  }

  async navigateToMockDrafts(leagueId: string) {
    await this.page.goto(`/league/${leagueId}/mocks`, { timeout: TEST_TIMEOUTS.TABLE_RENDER });
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
    // First ensure the Search Settings section is expanded
    const searchSettingsHeader = this.page.getByText('Search Settings');
    await searchSettingsHeader.click();
    await this.page.waitForTimeout(500);
    
    if (position === '') {
      // Show all positions - click "All" button
      const allButton = this.page.getByRole('button', { name: 'All' });
      await allButton.click();
    } else {
      // Show only specific position
      // First clear all positions
      await this.positionNoneButton.click();
      await this.page.waitForTimeout(200);
      
      // Then check the specific position checkbox.
      // Exact text, not a substring: hasText: 'RB' also matches labels like
      // "FLEX (RB/WR/TE)", which multi-matches and then strict-mode-violates on click.
      const positionLabel = this.page.locator('label').filter({ hasText: new RegExp(`^\\s*${position}\\s*$`) });
      const positionCheckbox = positionLabel.locator('input[type="checkbox"]');
      await positionCheckbox.click();
    }
    await this.page.waitForTimeout(300);
  }

  async setPriceRange(min: number, max: number) {
    // First ensure the Search Settings section is expanded
    const searchSettingsHeader = this.page.getByText('Search Settings');
    await searchSettingsHeader.click();
    await this.page.waitForTimeout(500);
    
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