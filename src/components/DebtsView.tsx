// Who owes whom in one group: people with their totals, then one card per debt (debtor → creditor)
// that opens to show the expenses and repayments behind it. Used by the app and the admin portal.
import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Card, Divider, Text, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import UserAvatar from './UserAvatar';

export type DebtItem = { kind: 'expense' | 'settlement'; id: string; label: string; date: string; paid_by: string; amount: number };
export type Debt = { from: string; to: string; amount: number; items: DebtItem[] };
export type DebtMember = { user_id: string; full_name: string; avatar_url: string | null; status: string; balance: number };
export type GroupDebts = { members: DebtMember[]; debts: Debt[] };

const OWES = '#E53935';
const GETS = '#43A047';
const money = (n: number) => `₹${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const day = (d: string) => { try { return format(new Date(d), 'dd MMM'); } catch { return d; } };

type Props = { data: GroupDebts; meId?: string; onOpenExpense?: (expenseId: string) => void };

export default function DebtsView({ data, meId, onOpenExpense }: Props) {
  const theme = useTheme();
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const byId = useMemo(() => Object.fromEntries(data.members.map((m) => [m.user_id, m])), [data]);
  const name = (id: string) => (id === meId ? 'You' : byId[id]?.full_name ?? 'Unknown');
  const shown = focus ? data.debts.filter((d) => d.from === focus || d.to === focus) : data.debts;
  const surface = { backgroundColor: theme.colors.elevation.level1 };
  const muted = { color: theme.colors.onSurfaceVariant };

  return (
    <View style={styles.wrap}>
      {/* People: tap one to see only their debts */}
      <Text variant="titleMedium" style={styles.heading}>People</Text>
      <View style={styles.people}>
        {data.members.map((m) => {
          const tone = m.balance < 0 ? OWES : m.balance > 0 ? GETS : theme.colors.onSurfaceVariant;
          const selected = focus === m.user_id;
          return (
            <TouchableOpacity key={m.user_id} activeOpacity={0.7} onPress={() => setFocus(selected ? null : m.user_id)}
              style={[styles.person, surface, { borderColor: selected ? theme.colors.primary : 'transparent' }]}>
              <UserAvatar user={m} size={40} />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" numberOfLines={1}>{name(m.user_id)}</Text>
                <Text variant="labelMedium" style={{ color: tone }}>
                  {m.balance < 0 ? `owes ${money(m.balance)}` : m.balance > 0 ? `gets ${money(m.balance)}` : 'settled up'}
                </Text>
                {m.status !== 'active' && <Text variant="labelSmall" style={muted}>{m.status === 'pending' ? 'invited' : 'left group'}</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {focus && <FocusSummary id={focus} debts={shown} name={name} onClear={() => setFocus(null)} />}

      <Text variant="titleMedium" style={styles.heading}>
        Who owes whom{shown.length ? ` · ${shown.length}` : ''}
      </Text>
      {shown.length === 0 && (
        <Card mode="contained" style={[styles.card, surface]}>
          <Card.Content style={styles.empty}>
            <MaterialCommunityIcons name="check-circle-outline" size={40} color={GETS} />
            <Text variant="bodyLarge">{focus ? `${name(focus)} ${focus === meId ? 'are' : 'is'} all settled up` : 'Everyone is settled up'}</Text>
          </Card.Content>
        </Card>
      )}
      {shown.map((d) => {
        const key = `${d.from}|${d.to}`;
        const expanded = open === key;
        return (
          <Card key={key} mode="contained" style={[styles.card, surface]}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setOpen(expanded ? null : key)}>
              <View style={styles.debtRow}>
                <Party member={byId[d.from]} label={name(d.from)} role="pays" color={OWES} />
                <View style={styles.flow}>
                  <Text variant="titleMedium" style={{ fontWeight: '700' }}>{money(d.amount)}</Text>
                  <View style={styles.arrow}>
                    <View style={[styles.arrowLine, { backgroundColor: theme.colors.outline }]} />
                    <MaterialCommunityIcons name="chevron-right" size={22} color={theme.colors.outline} style={styles.arrowHead} />
                  </View>
                  <Text variant="labelSmall" style={muted}>owes</Text>
                </View>
                <Party member={byId[d.to]} label={name(d.to)} role="receives" color={GETS} />
              </View>
              <View style={[styles.debtFoot, { borderTopColor: theme.colors.outlineVariant }]}>
                <Text variant="bodySmall" style={muted}>
                  {d.items.length} {d.items.length === 1 ? 'entry' : 'entries'}
                </Text>
                <Text variant="labelLarge" style={{ color: theme.colors.primary }}>{expanded ? 'Hide details' : 'Why?'}</Text>
              </View>
            </TouchableOpacity>
            {expanded && <Breakdown debt={d} name={name} onOpenExpense={onOpenExpense} />}
          </Card>
        );
      })}
    </View>
  );
}

function Party({ member, label, role, color }: { member?: DebtMember; label: string; role: string; color: string }) {
  return (
    <View style={styles.party}>
      <UserAvatar user={member} size={48} />
      <Text variant="titleSmall" numberOfLines={1} style={{ maxWidth: '100%' }}>{label}</Text>
      <Text variant="labelSmall" style={{ color }}>{role}</Text>
    </View>
  );
}

// One line per expense / repayment, with how it moved this debt, and the total.
function Breakdown({ debt, name, onOpenExpense }: { debt: Debt; name: (id: string) => string; onOpenExpense?: (id: string) => void }) {
  const theme = useTheme();
  const muted = { color: theme.colors.onSurfaceVariant };
  const from = name(debt.from);
  const to = name(debt.to);
  const describe = (i: DebtItem) => {
    if (i.kind === 'settlement') return i.paid_by === debt.from ? `${from} paid ${to} back` : `${to} paid ${from}`;
    return i.paid_by === debt.to ? `${to} paid, ${from}'s share` : `${from} paid, ${to}'s share (cancels out)`;
  };
  const icon = (i: DebtItem) => (i.kind === 'settlement' ? 'cash-check' : i.amount > 0 ? 'receipt' : 'swap-horizontal');
  return (
    <View style={[styles.breakdown, { borderTopColor: theme.colors.outlineVariant }]}>
      {debt.items.map((i, n) => {
        const color = i.amount > 0 ? OWES : GETS;
        const row = (
          <View style={styles.itemRow}>
            <View style={[styles.itemIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
              <MaterialCommunityIcons name={icon(i) as any} size={18} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium" numberOfLines={1}>{i.label}</Text>
              <Text variant="bodySmall" style={muted} numberOfLines={1}>{day(i.date)} · {describe(i)}</Text>
            </View>
            <Text variant="titleSmall" style={{ color }}>{i.amount > 0 ? '+' : '−'}{money(i.amount)}</Text>
          </View>
        );
        return (
          <React.Fragment key={`${i.kind}:${i.id}:${n}`}>
            {i.kind === 'expense' && onOpenExpense
              ? <TouchableOpacity activeOpacity={0.7} onPress={() => onOpenExpense(i.id)}>{row}</TouchableOpacity>
              : row}
          </React.Fragment>
        );
      })}
      <Divider style={{ marginVertical: 8 }} />
      <View style={styles.itemRow}>
        <Text variant="titleSmall" style={{ flex: 1 }}>{from} {from === 'You' ? 'owe' : 'owes'} {to}</Text>
        <Text variant="titleMedium" style={{ fontWeight: '700', color: OWES }}>{money(debt.amount)}</Text>
      </View>
    </View>
  );
}

// "Ali owes ₹2,200 in total: ₹1,600 to Shareer, ₹600 to Sara."
function FocusSummary({ id, debts, name, onClear }: { id: string; debts: Debt[]; name: (id: string) => string; onClear: () => void }) {
  const theme = useTheme();
  const owes = debts.filter((d) => d.from === id);
  const gets = debts.filter((d) => d.to === id);
  const total = (l: Debt[]) => l.reduce((t, d) => t + d.amount, 0);
  const who = name(id);
  const parts: string[] = [];
  if (owes.length) parts.push(`${who} ${who === 'You' ? 'owe' : 'owes'} ${money(total(owes))}: ${owes.map((d) => `${money(d.amount)} to ${name(d.to)}`).join(', ')}.`);
  if (gets.length) parts.push(`${who} ${who === 'You' ? 'get' : 'gets'} back ${money(total(gets))}: ${gets.map((d) => `${money(d.amount)} from ${name(d.from)}`).join(', ')}.`);
  if (!parts.length) return null;
  return (
    <Card mode="contained" style={[styles.card, { backgroundColor: theme.colors.secondaryContainer }]}>
      <Card.Content style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <MaterialCommunityIcons name="information-outline" size={20} color={theme.colors.onSecondaryContainer} />
        <Text variant="bodyMedium" style={{ flex: 1, color: theme.colors.onSecondaryContainer }}>{parts.join(' ')}</Text>
        <TouchableOpacity onPress={onClear} accessibilityLabel="Show everyone">
          <MaterialCommunityIcons name="close" size={20} color={theme.colors.onSecondaryContainer} />
        </TouchableOpacity>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12 },
  heading: { marginTop: 8 },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 2, flexGrow: 1, flexBasis: 160, maxWidth: 260 },
  card: { borderRadius: 16, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  debtRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 12 },
  party: { flex: 1, alignItems: 'center', gap: 4 },
  flow: { flex: 1.2, alignItems: 'center', gap: 2 },
  arrow: { width: '100%', height: 22, justifyContent: 'center' },
  arrowLine: { height: 2, marginRight: 8, borderRadius: 1 },
  arrowHead: { position: 'absolute', right: -4 },
  debtFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  breakdown: { paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  itemIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
