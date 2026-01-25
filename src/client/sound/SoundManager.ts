import { Howl } from "howler";
import kaChingSound from "../../../resources/sounds/effects/ka-ching.mp3";

// Music loaded from static path - not bundled in repo
// Menu music (also included in in-game playlist):
// Download from: https://pixabay.com/music/supernatural-enveloped-mission-4-operation-alpha-116601/
const MENU_MUSIC_PATH =
  "/sounds/music/enveloped-mission-4-operation-alpha-116601.mp3";

// In-game music playlist - download these files to resources/sounds/music/
// 1. https://pixabay.com/music/supernatural-enveloped-mission-4-operation-alpha-116601/
// 2. https://pixabay.com/music/crime-scene-enveloped-mission-9-and-10-the-farewell-and-end-titles-261884/
// 3. https://pixabay.com/music/ambient-the-z-files-untouched-248952/
// 4. https://pixabay.com/music/pulses-enveloped-mission-5-d-day-124386/
// 5. https://pixabay.com/music/pulses-enveloped-mission-nice-to-meet-you-115992/
const IN_GAME_MUSIC_PATHS = [
  "/sounds/music/enveloped-mission-4-operation-alpha-116601.mp3",
  "/sounds/music/enveloped-mission-9-and-10-the-farewell-and-end-titles-261884.mp3",
  "/sounds/music/the-z-files-_untouched-248952.mp3",
  "/sounds/music/enveloped-mission-5-d-day-124386.mp3",
  "/sounds/music/enveloped-mission-nice-to-meet-you-115992.mp3",
];

export enum SoundEffect {
  KaChing = "ka-ching",
}

class SoundManager {
  private backgroundMusic: Howl[] = [];
  private menuMusic: Howl | null = null;
  private currentTrack: number = 0;
  private shuffledOrder: number[] = [];
  private soundEffects: Map<SoundEffect, Howl> = new Map();
  private soundEffectsVolume: number = 1;
  private backgroundMusicVolume: number = 0;
  private menuMusicVolume: number = 0.3;
  private isMenuMusicPlaying: boolean = false;

  constructor() {
    // Create Howl instances for all in-game tracks
    this.backgroundMusic = IN_GAME_MUSIC_PATHS.map(
      (path) =>
        new Howl({
          src: [path],
          loop: false,
          onend: this.playNext.bind(this),
          volume: 0,
        }),
    );

    // Shuffle the playlist order
    this.shufflePlaylist();

    // Menu music - specific track for the main menu (loops)
    this.menuMusic = new Howl({
      src: [MENU_MUSIC_PATH],
      loop: true,
      volume: this.menuMusicVolume,
    });

    this.loadSoundEffect(SoundEffect.KaChing, kaChingSound);
  }

  private shufflePlaylist(): void {
    // Fisher-Yates shuffle
    this.shuffledOrder = Array.from(
      { length: this.backgroundMusic.length },
      (_, i) => i,
    );
    for (let i = this.shuffledOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledOrder[i], this.shuffledOrder[j]] = [
        this.shuffledOrder[j],
        this.shuffledOrder[i],
      ];
    }
    this.currentTrack = 0;
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
    if (this.backgroundMusic.length > 0) {
      const trackIndex = this.shuffledOrder[this.currentTrack];
      if (!this.backgroundMusic[trackIndex].playing()) {
        this.backgroundMusic[trackIndex].play();
      }
    }
  }

  public stopBackgroundMusic(): void {
    if (this.backgroundMusic.length > 0) {
      const trackIndex = this.shuffledOrder[this.currentTrack];
      this.backgroundMusic[trackIndex].stop();
    }
  }

  public setBackgroundMusicVolume(volume: number): void {
    this.backgroundMusicVolume = Math.max(0, Math.min(1, volume));
    this.backgroundMusic.forEach((track) => {
      track.volume(this.backgroundMusicVolume);
    });
  }

  private playNext(): void {
    this.currentTrack = this.currentTrack + 1;
    // If we've played all tracks, reshuffle and start over
    if (this.currentTrack >= this.shuffledOrder.length) {
      this.shufflePlaylist();
    }
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
