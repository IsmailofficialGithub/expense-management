import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Button, Card, DataTable, HelperText, IconButton, Searchbar, Text } from 'react-native-paper';
import AdminForm from './AdminForm';
import { adminApi, listOf } from './adminApi';

const PAGE = 25;
const cell = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 80);

export type Column = { key: string; label?: string; render?: (row: any) => React.ReactNode };

// Generic paginated CRUD table over /admin/<resource>.
export default function AdminTable({ resource, columns, fields, canCreate = true, onDelete, rowActions, renderExpanded, filters }: {
  resource: string;
  columns: Column[];
  fields?: string[]; // writable fields; omit for read-only
  canCreate?: boolean;
  onDelete?: (row: any) => Promise<void>; // override default DELETE
  rowActions?: (row: any, reload: () => void) => React.ReactNode;
  renderExpanded?: (row: any) => React.ReactNode;
  filters?: Record<string, unknown>;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number | undefined>();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any | null>(null); // {} = create
  const [expanded, setExpanded] = useState<string | null>(null);
  const narrow = useWindowDimensions().width < 768;

  const load = useCallback(async () => {
    try {
      setError('');
      const res = listOf(await adminApi.get(`/admin/${resource}`, { page: page + 1, limit: PAGE, q, ...filters }));
      setRows(res.rows);
      setTotal(res.total);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    }
  }, [resource, page, q, JSON.stringify(filters)]);

  useEffect(() => { load(); }, [load]);

  const remove = async (row: any) => {
    if (!window.confirm(`Delete ${resource} ${row.id}? This cannot be undone.`)) return;
    try {
      if (onDelete) await onDelete(row);
      else await adminApi.del(`/admin/${resource}/${row.id}`);
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Delete failed');
    }
  };

  const pages = total !== undefined ? Math.max(1, Math.ceil(total / PAGE)) : undefined;
  const numberOfPages = pages ?? (rows.length === PAGE ? page + 2 : page + 1);
  const pageLabel = `Page ${page + 1}${pages ? ` of ${pages}` : ''}${total !== undefined ? ` · ${total} rows` : ''}`;
  const actions = (row: any) => (
    <>
      {rowActions?.(row, load)}
      {fields && <IconButton icon="pencil" size={18} onPress={() => setEditing(row)} accessibilityLabel="Edit" />}
      {fields && <IconButton icon="delete" size={18} onPress={() => remove(row)} accessibilityLabel="Delete" />}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Searchbar style={{ flex: 1, minWidth: 180 }} placeholder="Search" value={q} onChangeText={(t) => { setQ(t); setPage(0); }} />
        <IconButton icon="refresh" onPress={load} />
        {fields && canCreate && <Button mode="contained" icon="plus" onPress={() => setEditing({})}>New</Button>}
      </View>
      {!!error && <HelperText type="error">{error}</HelperText>}
      {narrow ? (
        // Phones: one card per row, label above value, instead of a 900px-wide table.
        <ScrollView style={{ flex: 1 }}>
          {rows.map((row) => (
            <Card key={row.id} style={{ marginBottom: 8 }} onPress={renderExpanded ? () => setExpanded(expanded === row.id ? null : row.id) : undefined}>
              <Card.Content>
                {columns.map((c) => (
                  <View key={c.key} style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                    <Text variant="labelMedium" style={{ width: 96, opacity: 0.7 }}>{c.label ?? c.key}</Text>
                    <View style={{ flex: 1 }}>{c.render ? c.render(row) : <Text selectable>{cell(row[c.key])}</Text>}</View>
                  </View>
                ))}
                {expanded === row.id && <ScrollView horizontal style={{ marginTop: 8 }}>{renderExpanded?.(row)}</ScrollView>}
              </Card.Content>
              {(fields || rowActions) && <Card.Actions>{actions(row)}</Card.Actions>}
            </Card>
          ))}
          {!rows.length && <Text style={{ padding: 16 }}>No rows</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
            <IconButton icon="chevron-left" disabled={page === 0} onPress={() => setPage(page - 1)} accessibilityLabel="Previous page" />
            <Text variant="bodySmall">{pageLabel}</Text>
            <IconButton icon="chevron-right" disabled={page + 1 >= numberOfPages} onPress={() => setPage(page + 1)} accessibilityLabel="Next page" />
          </View>
        </ScrollView>
      ) : (
      <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
        <DataTable style={{ minWidth: 900 }}>
          <DataTable.Header>
            {columns.map((c) => <DataTable.Title key={c.key}>{c.label ?? c.key}</DataTable.Title>)}
            <DataTable.Title numeric>Actions</DataTable.Title>
          </DataTable.Header>
          {rows.map((row) => (
            <React.Fragment key={row.id}>
              <DataTable.Row onPress={renderExpanded ? () => setExpanded(expanded === row.id ? null : row.id) : undefined}>
                {columns.map((c) => <DataTable.Cell key={c.key}>{c.render ? c.render(row) : cell(row[c.key])}</DataTable.Cell>)}
                <DataTable.Cell numeric>{actions(row)}</DataTable.Cell>
              </DataTable.Row>
              {expanded === row.id && <View style={{ padding: 12 }}>{renderExpanded?.(row)}</View>}
            </React.Fragment>
          ))}
          {!rows.length && <Text style={{ padding: 16 }}>No rows</Text>}
          <DataTable.Pagination page={page} numberOfPages={numberOfPages} onPageChange={setPage} label={pageLabel} />
        </DataTable>
      </ScrollView>
      )}
      {editing && fields && (
        <AdminForm
          title={editing.id ? `Edit ${resource}` : `New ${resource}`}
          fields={fields}
          initial={editing.id ? editing : undefined}
          onDismiss={() => setEditing(null)}
          onSubmit={async (values, notify) => {
            const n = notify ? '?notify=true' : '';
            if (editing.id) await adminApi.patch(`/admin/${resource}/${editing.id}${n}`, values);
            else await adminApi.post(`/admin/${resource}${n}`, values);
            load();
          }}
        />
      )}
    </View>
  );
}
