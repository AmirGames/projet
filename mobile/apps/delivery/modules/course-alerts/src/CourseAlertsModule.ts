import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface CourseAlertStatus {
  overlayGranted: boolean;
  alarmVolume: number;
  alarmVolumeMax: number;
  doNotDisturb: boolean;
}

declare class CourseAlertsModule extends NativeModule {
  getStatus(): CourseAlertStatus;
  configure(active: boolean, popup: boolean, alarm: boolean, sound: boolean): Promise<void>;
  openOverlaySettings(): Promise<void>;
  openSoundSettings(): Promise<void>;
  presentOffer(json: string): Promise<void>;
  dismissOffer(offerId: string): Promise<void>;
  silence(): Promise<void>;
  ring(): Promise<void>;
  testInFiveSeconds(): Promise<void>;
}

export default requireOptionalNativeModule<CourseAlertsModule>('CourseAlerts');
