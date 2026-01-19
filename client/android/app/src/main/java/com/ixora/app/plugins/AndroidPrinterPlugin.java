package com.ixora.app.plugins;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;

@CapacitorPlugin(name = "AndroidPrinter")
public class AndroidPrinterPlugin extends Plugin {

    private static final String TAG = "AndroidPrinterPlugin";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private BluetoothSocket bluetoothSocket;
    private BluetoothAdapter bluetoothAdapter;

    @Override
    public void load() {
        super.load();
        bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    @PluginMethod
    public void printZPL(PluginCall call) {
        String zpl = call.getString("zpl");
        if (zpl == null || zpl.isEmpty()) {
            call.reject("ZPL no proporcionado");
            return;
        }

        JSObject result = new JSObject();
        result.put("result", "ERROR: printZPL requiere impresora Bluetooth. Use printToBluetooth.");
        call.resolve(result);
    }

    @PluginMethod
    public void printToBluetooth(PluginCall call) {
        String deviceName = call.getString("deviceName", "ZQ210");
        String zpl = call.getString("zpl");

        if (zpl == null || zpl.isEmpty()) {
            call.reject("ZPL no proporcionado");
            return;
        }

        if (bluetoothAdapter == null) {
            call.reject("Bluetooth no disponible en este dispositivo");
            return;
        }

        if (!bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth no está activado");
            return;
        }

        // Verificar permisos de Bluetooth (Android 12+ requiere permisos en tiempo de ejecución)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) 
                    != PackageManager.PERMISSION_GRANTED) {
                call.reject("Se requiere permiso BLUETOOTH_CONNECT. Por favor, concede el permiso en la configuración de la app.");
                return;
            }
        }

        // Buscar dispositivo Bluetooth
        BluetoothDevice device = null;
        Set<BluetoothDevice> pairedDevices;
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) 
                    != PackageManager.PERMISSION_GRANTED) {
                call.reject("Se requiere permiso BLUETOOTH_CONNECT para buscar dispositivos.");
                return;
            }
        }
        
        pairedDevices = bluetoothAdapter.getBondedDevices();

        for (BluetoothDevice d : pairedDevices) {
            if (d.getName() != null && (d.getName().contains(deviceName) || deviceName.contains(d.getName()))) {
                device = d;
                break;
            }
        }

        // Si no se encuentra con el nombre exacto, buscar por prefijo "ZQ"
        if (device == null) {
            for (BluetoothDevice d : pairedDevices) {
                if (d.getName() != null && (d.getName().startsWith("ZQ") || d.getName().contains("Zebra"))) {
                    device = d;
                    break;
                }
            }
        }

        if (device == null) {
            JSObject result = new JSObject();
            result.put("result", "ERROR: Impresora " + deviceName + " no encontrada. Asegúrate de que esté emparejada.");
            call.resolve(result);
            return;
        }

        // Capturar device como final para usar en lambda
        final BluetoothDevice finalDevice = device;

        // Conectar y enviar ZPL
        new Thread(() -> {
            try {
                // Verificar permisos antes de conectar (Android 12+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) 
                            != PackageManager.PERMISSION_GRANTED) {
                        JSObject result = new JSObject();
                        result.put("result", "ERROR: Se requiere permiso BLUETOOTH_CONNECT");
                        call.resolve(result);
                        return;
                    }
                }
                
                bluetoothSocket = finalDevice.createRfcommSocketToServiceRecord(SPP_UUID);
                
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) 
                            != PackageManager.PERMISSION_GRANTED) {
                        JSObject result = new JSObject();
                        result.put("result", "ERROR: Se requiere permiso BLUETOOTH_CONNECT para conectar");
                        call.resolve(result);
                        return;
                    }
                }
                
                bluetoothSocket.connect();

                OutputStream outputStream = bluetoothSocket.getOutputStream();
                outputStream.write(zpl.getBytes());
                outputStream.flush();

                bluetoothSocket.close();

                JSObject result = new JSObject();
                result.put("result", "OK");
                call.resolve(result);
            } catch (IOException e) {
                Log.e(TAG, "Error al imprimir vía Bluetooth", e);
                JSObject result = new JSObject();
                result.put("result", "ERROR: " + e.getMessage());
                call.resolve(result);
            }
        }).start();
    }

    @PluginMethod
    public void findBluetoothPrinters(PluginCall call) {
        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            JSObject result = new JSObject();
            result.put("devices", new ArrayList<>());
            call.resolve(result);
            return;
        }

        // Verificar permisos de Bluetooth (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) 
                    != PackageManager.PERMISSION_GRANTED) {
                JSObject result = new JSObject();
                result.put("devices", new ArrayList<>());
                call.resolve(result);
                return;
            }
        }

        ArrayList<JSObject> devices = new ArrayList<>();
        Set<BluetoothDevice> pairedDevices;
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) 
                    != PackageManager.PERMISSION_GRANTED) {
                JSObject result = new JSObject();
                result.put("devices", new ArrayList<>());
                call.resolve(result);
                return;
            }
        }
        
        pairedDevices = bluetoothAdapter.getBondedDevices();

        for (BluetoothDevice device : pairedDevices) {
            if (device.getName() != null && 
                (device.getName().startsWith("ZQ") || 
                 device.getName().contains("Zebra") || 
                 device.getName().contains("Printer"))) {
                JSObject deviceObj = new JSObject();
                deviceObj.put("name", device.getName());
                deviceObj.put("address", device.getAddress());
                devices.add(deviceObj);
            }
        }

        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }
}
