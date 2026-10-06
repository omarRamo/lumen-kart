# Mobile cockpit

The interface uses a landscape racing cockpit inspired by mobile arcade racers while keeping Turbo Kart Rally's existing characters and visual identity.

- Top left: lap and timer. Top center: held item. Top right: motion control, recalibration and pause.
- Bottom left: large steer buttons; the minimap sits above them.
- Bottom right: item and drift under the right thumb, with brake beside drift. Position remains above these controls.
- The center stays available for the track and opponents. Automatic throttle removes the need to hold an accelerator.
- Buttons use at least 44-pixel touch targets, multi-touch pointer capture, and safe-area offsets for device cutouts. Interrupted touches are released on cancellation, blur and state changes.
- Portrait browser layouts rearrange character selection and race controls; native apps request landscape.

Native tilt uses CoreMotion on iOS and Android gravity sensors (with a filtered accelerometer fallback), projected into screen orientation. The browser uses device orientation events. Permission is requested from a player tap, never at page load. The first sensor reading becomes neutral; a deadzone filters small movements and full steering is reached at a 24-degree relative tilt. Touch steering overrides the sensor. A denied permission or absent sensor leaves the touch controls usable. Calibration is reset when screen orientation changes.

Mobile rendering caps pixel ratio at 1.25 and disables bloom to preserve more frame time. Physics runs in fixed 1/60-second steps with bounded catch-up, independently of rendering. Physical-device frame rate and ergonomics need validation before a store release.

## Browser captures

![Landscape character and mode selection](screenshots/mobile-landscape-menu.png)

![Portrait character and mode selection](screenshots/mobile-portrait-menu.png)

![Neon Harbor mobile cockpit](screenshots/neon-harbor-mobile.png)
