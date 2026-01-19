import { registerPlugin } from '@capacitor/core';

export interface AndroidPrinterPlugin {
  printZPL(options: { zpl: string }): Promise<{ result: string }>;
  printToBluetooth(options: { deviceName: string; zpl: string }): Promise<{ result: string }>;
  findBluetoothPrinters(): Promise<{ devices: Array<{ name: string; address: string }> }>;
}

const AndroidPrinter = registerPlugin<AndroidPrinterPlugin>('AndroidPrinter', {
  web: () => import('./AndroidPrinter.web').then(m => new m.AndroidPrinterWeb()),
});

export default AndroidPrinter;






