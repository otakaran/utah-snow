// Which grid cell the bottom-sheet picker is editing (null = closed). Shared by Grid and DayPicker.
import { signal } from '@preact/signals';

export interface PickerTarget {
  personId: string;
  date: string;
}

export const pickerTarget = signal<PickerTarget | null>(null);

export const openPicker = (personId: string, date: string): void => {
  pickerTarget.value = { personId, date };
};

export const closePicker = (): void => {
  pickerTarget.value = null;
};
