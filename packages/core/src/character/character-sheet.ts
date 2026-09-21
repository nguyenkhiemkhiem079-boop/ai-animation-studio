import {
  CharacterSheet,
  CharacterSheetSchema,
  TurnaroundView,
  TurnaroundViewSchema,
} from '../domain/asset.js';
import { ValidationError } from '../errors/index.js';

export const REQUIRED_TURNAROUND_VIEWS: TurnaroundView[] = [
  'front',
  'three_quarter_left',
  'three_quarter_right',
  'profile_left',
  'profile_right',
  'back',
];

export class CanonicalCharacterSheet {
  private data: CharacterSheet;

  constructor(data: CharacterSheet) {
    this.data = CharacterSheetSchema.parse(data);
  }

  public static create(
    characterId: string,
    options: {
      version?: number;
      paletteColors?: string[];
      heightCm?: number;
      proportionsDescription?: string;
    } = {}
  ): CanonicalCharacterSheet {
    return new CanonicalCharacterSheet({
      characterId,
      version: options.version ?? 1,
      views: {} as Record<TurnaroundView, string>,
      paletteColors: options.paletteColors ?? [],
      heightCm: options.heightCm,
      proportionsDescription: options.proportionsDescription,
      updatedAt: new Date().toISOString(),
    });
  }

  public get characterId(): string {
    return this.data.characterId;
  }

  public get version(): number {
    return this.data.version;
  }

  public get views(): Record<TurnaroundView, string> {
    return { ...this.data.views } as Record<TurnaroundView, string>;
  }

  public get neutralPortraitAssetId(): string | undefined {
    return this.data.neutralPortraitAssetId;
  }

  public setNeutralPortrait(assetId: string): void {
    this.data.neutralPortraitAssetId = assetId;
    this.data.updatedAt = new Date().toISOString();
  }

  public getView(view: TurnaroundView): string | undefined {
    return this.data.views[view];
  }

  public setView(view: TurnaroundView, assetId: string): void {
    const validatedView = TurnaroundViewSchema.parse(view);
    if (!assetId || typeof assetId !== 'string') {
      throw new ValidationError(`Invalid assetId provided for view "${view}"`);
    }
    this.data.views[validatedView] = assetId;
    this.data.updatedAt = new Date().toISOString();
  }

  public isComplete(): boolean {
    return REQUIRED_TURNAROUND_VIEWS.every(
      (v) => typeof this.data.views[v] === 'string' && this.data.views[v].length > 0
    );
  }

  public getMissingViews(): TurnaroundView[] {
    return REQUIRED_TURNAROUND_VIEWS.filter(
      (v) => !this.data.views[v] || this.data.views[v].length === 0
    );
  }

  public toJSON(): CharacterSheet {
    return { ...this.data };
  }
}
