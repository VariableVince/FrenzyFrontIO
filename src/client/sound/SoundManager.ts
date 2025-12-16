import { Howl } from "howler";
import of4 from "../../../proprietary/sounds/music/enveloped-mission-4-operation-alpha-116601.mp3";
import kaChingSound from "../../../resources/sounds/effects/ka-ching.mp3";

export enum SoundEffect {
  KaChing = "ka-ching",
}

class SoundManager {
  private backgroundMusic: Howl[] = [];
  private menuMusic: Howl | null = null;
  private currentTrack: number = 0;
  private soundEffects: Map<SoundEffect, Howl> = new Map();
  private soundEffectsVolume: number = 1;
  private backgroundMusicVolume: number = 0;
  private menuMusicVolume: number = 0.3;
  private isMenuMusicPlaying: boolean = false;

  constructor() {
    this.backgroundMusic = [
      new Howl({
        src: [of4],
        loop: false,
        onend: this.playNext.bind(this),
        volume: 0,
      }),
      /*       new Howl({
        src: [openfront],
        loop: false,
        onend: this.playNext.bind(this),
        volume: 0,
      }),
      new Howl({
        src: [war],
        loop: false,
        onend: this.playNext.bind(this),
        volume: 0,
      }), */
    ];

    // Menu music - same track as in-game, but for the main menu
    this.menuMusic = new Howl({
      src: [of4],
      loop: true,
      volume: this.menuMusicVolume,
    });

    this.loadSoundEffect(SoundEffect.KaChing, kaChingSound);
  }

  public playMenuMusic(): void {
    if (this.menuMusic && !this.isMenuMusicPlaying) {
      this.menuMusic.play();
      this.isMenuMusicPlaying = true;
    }
  }

  public stopMenuMusic(): void {
    if (this.menuMusic && this.isMenuMusicPlaying) {
      this.menuMusic.stop();
      this.isMenuMusicPlaying = false;
    }
  }

  public setMenuMusicVolume(volume: number): void {
    this.menuMusicVolume = Math.max(0, Math.min(1, volume));
    if (this.menuMusic) {
      this.menuMusic.volume(this.menuMusicVolume);
    }
  }

  public playBackgroundMusic(): void {
    if (
      this.backgroundMusic.length > 0 &&
      !this.backgroundMusic[this.currentTrack].playing()
    ) {
      this.backgroundMusic[this.currentTrack].play();
    }
  }

  public stopBackgroundMusic(): void {
    if (this.backgroundMusic.length > 0) {
      this.backgroundMusic[this.currentTrack].stop();
    }
  }

  public setBackgroundMusicVolume(volume: number): void {
    this.backgroundMusicVolume = Math.max(0, Math.min(1, volume));
    this.backgroundMusic.forEach((track) => {
      track.volume(this.backgroundMusicVolume);
    });
  }

  private playNext(): void {
    this.currentTrack = (this.currentTrack + 1) % this.backgroundMusic.length;
    this.playBackgroundMusic();
  }

  public loadSoundEffect(name: SoundEffect, src: string): void {
    if (!this.soundEffects.has(name)) {
      const sound = new Howl({
        src: [src],
        volume: this.soundEffectsVolume,
      });
      this.soundEffects.set(name, sound);
    }
  }

  public playSoundEffect(name: SoundEffect): void {
    const sound = this.soundEffects.get(name);
    if (sound) {
      sound.play();
    }
  }

  public setSoundEffectsVolume(volume: number): void {
    this.soundEffectsVolume = Math.max(0, Math.min(1, volume));
    this.soundEffects.forEach((sound) => {
      sound.volume(this.soundEffectsVolume);
    });
  }

  public stopSoundEffect(name: SoundEffect): void {
    const sound = this.soundEffects.get(name);
    if (sound) {
      sound.stop();
    }
  }

  public unloadSoundEffect(name: SoundEffect): void {
    const sound = this.soundEffects.get(name);
    if (sound) {
      sound.unload();
      this.soundEffects.delete(name);
    }
  }
}

export default new SoundManager();
