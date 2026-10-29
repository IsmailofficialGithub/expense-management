import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { Button, Checkbox, Dialog, HelperText, Portal, TextInput } from 'react-native-paper';

// Edits a row as text fields; values are parsed back as JSON when they look like JSON (numbers, booleans, objects).
const toText = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const fromText = (s: string): unknown => {
  if (s === '') return null;
  try { return JSON.parse(s); } catch { return s; }
};

export default function AdminForm({ title, fields, initial, onSubmit, onDismiss }: {
  title: string;
  fields: string[];
  initial?: Record<string, any>;
  onSubmit: (values: Record<string, unknown>, notify: boolean) => Promise<void>;
  onDismiss: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f, toText(initial?.[f])])));
  const [notify, setNotify] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      // Only send changed fields on edit.
      const out = Object.fromEntries(fields.filter((f) => !initial || values[f] !== toText(initial[f])).map((f) => [f, fromText(values[f])]));
      await onSubmit(out, notify);
      onDismiss();
    } catch (e: any) {
      setError(e?.message ?? 'Failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
      <Dialog visible onDismiss={onDismiss} style={{ maxWidth: 640, alignSelf: 'center', width: '95%' }}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.ScrollArea style={{ maxHeight: 480 }}>
          <ScrollView>
            {fields.map((f) => (
              <TextInput key={f} label={f} mode="outlined" dense value={values[f]} style={{ marginVertical: 4 }}
                multiline={values[f].length > 60} onChangeText={(t) => setValues((v) => ({ ...v, [f]: t }))} />
            ))}
            <Checkbox.Item label="Notify affected users" status={notify ? 'checked' : 'unchecked'} onPress={() => setNotify(!notify)} />
            {!!error && <HelperText type="error">{error}</HelperText>}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button mode="contained" loading={busy} disabled={busy} onPress={submit}>Save</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
