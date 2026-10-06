package com.omartrabelsi.lumenkart;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Local plugin consumed by src/native-motion.js (registerPlugin('TiltMotion')).
 * Emits "gravity" events {x, y, z} in g using the iOS CoreMotion sign convention
 * (portrait upright: y = -1), from the gravity sensor or a low-passed accelerometer.
 * Sensors stop while the app is paused and resume if JS still wants them.
 */
@CapacitorPlugin(name = "TiltMotion")
public class TiltMotionPlugin extends Plugin implements SensorEventListener {
    private SensorManager manager;
    private Sensor sensor;
    private boolean running;
    private boolean requested;
    private boolean initialized;
    private final float[] filtered = new float[3];
    private static final String[] AXES = { "x", "y", "z" };

    @Override
    public void load() {
        manager = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (manager != null) {
            sensor = manager.getDefaultSensor(Sensor.TYPE_GRAVITY);
            if (sensor == null) sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
        }
    }

    @PluginMethod
    public void start(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            requested = false;
            stopSensors();
            if (manager == null || sensor == null) {
                call.reject("Motion sensors are unavailable on this device");
                return;
            }
            initialized = false;
            running = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
            requested = running;
            if (running) call.resolve();
            else call.reject("Unable to start motion sensors");
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            requested = false;
            stopSensors();
            call.resolve();
        });
    }

    private void stopSensors() {
        running = false;
        if (manager != null) manager.unregisterListener(this);
    }

    @Override
    protected void handleOnResume() {
        if (requested && manager != null && sensor != null) {
            initialized = false;
            running = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
        }
    }

    @Override
    protected void handleOnPause() {
        stopSensors();
    }

    @Override
    protected void handleOnDestroy() {
        requested = false;
        stopSensors();
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!running) return;
        JSObject gravity = new JSObject();
        for (int i = 0; i < 3; i++) {
            float value = event.values[i];
            // Accelerometer fallback: a low-pass filter removes most transient acceleration.
            if (event.sensor.getType() == Sensor.TYPE_ACCELEROMETER && initialized) {
                value = filtered[i] * 0.85f + value * 0.15f;
            }
            filtered[i] = value;
            gravity.put(AXES[i], -value / SensorManager.GRAVITY_EARTH);
        }
        initialized = true;
        notifyListeners("gravity", gravity);
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
