export {
  BIKE_VEHICLE_CONFIG,
  DRIVABLE_VEHICLES,
  HERO_VEHICLE_CONFIG,
  SPORTS_CAR_VEHICLE_CONFIG,
  type BikeRiderMountConfig,
  type HeroVehicleConfig,
  type VehicleAudioProfile,
  type VehicleHandlingSpec,
  type VehicleLeanConfig,
  type VehicleType,
  type WheelNodeBinding,
  type WheelSlot,
} from './vehicleConfig';
export {
  loadHeroVehicle,
  type LoadedHeroVehicle,
  type SteeringWheelRig,
  type VehicleDimensions,
  type VehicleRig,
  type WheelRig,
} from './vehicleModel';
export {
  DRIVE_SPEED_MODE_CONFIGS,
  DRIVE_SPEED_MODE_ORDER,
  VehicleController,
  type DriveSpeedMode,
  type DriveSpeedModeConfig,
  type VehicleControlInput,
  type VehicleDamageState,
  type VehicleDamageTickResult,
  type VehicleGear,
  type VehicleImpactEvent,
  type VehicleTelemetry,
} from './vehicleController';
export { VehicleDamageEffects } from './vehicleDamageEffects';
export { VehicleDamageVisualController } from './vehicleDamageVisuals';
