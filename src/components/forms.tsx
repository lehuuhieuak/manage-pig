'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Decimal from '@/lib/decimal';
import type { Batch, Entry, FeedType, Mutation, Snapshot } from '@/lib/types';
import { dateLabel, kindLabel, money, today } from '@/lib/format';
import type { RunMutation } from './farm-app';

export type Editor = { type: 'farm' } | { type: 'batch'; farmId: string; batch?: Batch } | { type: 'end'; batch: Batch } | { type: 'entry'; kind: Entry['kind']; batch: Batch; entry?: Entry; month?: string };
type Props = { editor: Editor; snapshot: Snapshot; run: RunMutation; close: () => void; reload: (month?: string) => void };
type DraftLine = { feedTypeId: string; name: string; bags: string; price: string; discount: string };
const decimal = (value: string) => value.trim().replace(',', '.');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Chưa lưu được. Vui lòng thử lại.';

export function Dialog({ children, title, busy, close }: { children: ReactNode; title: string; busy: boolean; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { dialog?.close(); }; }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby="form-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}><div className="dialog-heading"><h2 id="form-title">{title}</h2><button className="close-button" aria-label="Đóng biểu mẫu" disabled={busy} onClick={close} type="button">×</button></div>{children}</dialog>;
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>; }
function Numeric({ value, onChange, integer = false, zero = false }: { value: string; onChange: (s: string) => void; integer?: boolean; zero?: boolean }) {
  return <input required type="text" inputMode={integer ? 'numeric' : 'decimal'} pattern={integer ? '[0-9]+' : '[0-9]+([.,][0-9]{1,6})?'} title={integer ? 'Nhập số nguyên dương' : zero ? 'Nhập số từ 0 trở lên, không dùng dấu phân cách hàng nghìn' : 'Nhập số dương, không dùng dấu phân cách hàng nghìn'} value={value} onChange={e => onChange(e.target.value)} autoComplete="off" />;
}

export function EditForm({ editor, snapshot, run, close, reload }: Props) {
  const entry = editor.type === 'entry' ? editor.entry : undefined;
  const initialEntry = entry || (editor.type === 'entry' && editor.kind === 'labor' ? snapshot.entries.find(e => e.batchId === editor.batch.id && e.kind === 'labor' && e.month === (editor.month || today().slice(0, 7))) : undefined);
  const batch = 'batch' in editor ? editor.batch : undefined;
  const [name, setName] = useState(batch?.name || '');
  const [date, setDate] = useState(initialEntry?.date || (editor.type === 'batch' ? batch?.startDate : editor.type === 'end' ? batch?.endDate : undefined) || today());
  const [pigs, setPigs] = useState(String(entry?.pigCount ?? (editor.type === 'batch' ? batch?.pigCount : undefined) ?? ''));
  const [amount, setAmount] = useState(initialEntry?.amount || (editor.type === 'batch' ? batch?.pigCost : '') || '');
  const [month, setMonth] = useState(editor.type === 'entry' ? editor.month || entry?.month || today().slice(0, 7) : today().slice(0, 7));
  const [description, setDescription] = useState(initialEntry?.description || '');
  const [kg, setKg] = useState(entry?.kg || '');
  const [price, setPrice] = useState(entry?.price || '');
  const [target, setTarget] = useState<Entry | undefined>(initialEntry);
  const [lines, setLines] = useState<DraftLine[]>(() => entry?.lines?.map(l => ({ ...l, bags: String(l.bags) })) || [blankLine(snapshot.feedTypes[0])]);
  const [feedTypes, setFeedTypes] = useState(snapshot.feedTypes);
  const [newFeedName, setNewFeedName] = useState('');
  const [addingFeed, setAddingFeed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [feedError, setFeedError] = useState('');
  const [feedUncertain, setFeedUncertain] = useState(false);
  const guard = useRef(false);
  const request = useRef({ signature: '', id: '' });
  const feedRequest = useRef({ signature: '', id: '' });
  const title = editor.type === 'farm' ? 'Thêm trại' : editor.type === 'batch' ? batch ? 'Sửa đợt nuôi' : 'Tạo đợt nuôi' : editor.type === 'end' ? 'Kết thúc đợt nuôi' : `${target ? 'Sửa' : 'Ghi'} ${kindLabel[editor.kind].toLowerCase()}`;
  function chooseMonth(value: string) {
    setMonth(value);
    if (editor.type !== 'entry') return;
    const existing = snapshot.entries.find(e => e.batchId === editor.batch.id && e.kind === 'labor' && e.month === value);
    const editing = existing || entry;
    setTarget(editing); setAmount(editing?.amount || ''); setDescription(editing?.description || ''); setDate(editing?.date || today());
  }
  function updateLine(index: number, patch: Partial<DraftLine>) { setLines(old => old.map((line, i) => i === index ? { ...line, ...patch } : line)); }
  function selectFeed(index: number, id: string) { const feed = feedTypes.find(f => f.id === id); if (feed) updateLine(index, { feedTypeId: id, name: feed.name, price: feed.lastPrice, discount: feed.lastDiscount }); }
  async function addFeed() {
    if (guard.current || !newFeedName.trim()) return;
    guard.current = true; setAddingFeed(true); setFeedError('');
    const signature = newFeedName.trim();
    if (feedRequest.current.signature !== signature) feedRequest.current = { signature, id: crypto.randomUUID() };
    try {
      const fresh = await run('createFeedType', { name: signature }, feedRequest.current.id);
      if (fresh) {
        setFeedTypes(fresh.feedTypes);
        const added = fresh.feedTypes.find(f => f.name === signature);
        if (added) setLines(old => old.some(l => !l.feedTypeId) ? old.map(l => !l.feedTypeId ? { ...l, feedTypeId: added.id, name: added.name, price: added.lastPrice, discount: added.lastDiscount } : l) : [...old, blankLine(added)]);
        setNewFeedName(''); setFeedUncertain(false); feedRequest.current = { signature: '', id: '' };
      } else setFeedError('Đã thêm loại cám. Chưa tải được danh mục mới; hãy đóng và mở lại biểu mẫu khi có mạng.');
    } catch (e) { setFeedError(errorMessage(e)); setFeedUncertain((e as { code?: string }).code === 'UNCERTAIN'); }
    finally { guard.current = false; setAddingFeed(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (guard.current || conflict || feedUncertain) return;
    let action: Mutation['action']; let data: Record<string, unknown>;
    if (editor.type === 'farm') { action = 'createFarm'; data = { name: name.trim() }; }
    else if (editor.type === 'batch') { action = batch ? 'updateBatch' : 'createBatch'; data = { ...(batch ? { id: batch.id, version: batch.version } : {}), farmId: editor.farmId, name: name.trim(), startDate: date, pigCount: Number(pigs), pigCost: decimal(amount) }; }
    else if (editor.type === 'end') { action = 'endBatch'; data = { id: editor.batch.id, version: editor.batch.version, endDate: date }; }
    else {
      action = 'saveEntry';
      data = { ...(target ? { id: target.id, version: target.version } : {}), batchId: editor.batch.id, kind: editor.kind, date, description: description.trim() };
      if (editor.kind === 'feed') data.lines = lines.map(l => ({ ...l, bags: Number(l.bags), price: decimal(l.price), discount: decimal(l.discount || '0') }));
      if (editor.kind === 'sale') Object.assign(data, { pigCount: Number(pigs), kg: decimal(kg), price: decimal(price) });
      if (editor.kind === 'labor') Object.assign(data, { month, amount: decimal(amount) });
      if (editor.kind === 'other') data.amount = decimal(amount);
    }
    const signature = JSON.stringify({ action, data });
    if (request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    guard.current = true; setBusy(true); setError('');
    try { await run(action, data, request.current.id); close(); }
    catch (e) { setError(errorMessage(e)); const code = (e as { code?: string }).code; setUncertain(code === 'UNCERTAIN'); setConflict(Boolean(code && /conflict|stale|version|labor_exists|active_batch/i.test(code))); }
    finally { guard.current = false; setBusy(false); }
  }
  let preview: string | null = null;
  try {
    if (editor.type === 'entry' && editor.kind === 'feed') preview = money(lines.reduce((sum, line) => sum.plus(new Decimal(decimal(line.bags) || 0).times(new Decimal(decimal(line.price) || 0).minus(decimal(line.discount) || 0))), new Decimal(0)).toDecimalPlaces(0));
    if (editor.type === 'entry' && editor.kind === 'sale') preview = money(new Decimal(decimal(kg) || 0).times(decimal(price) || 0).toDecimalPlaces(0));
  } catch { /* An unfinished decimal is kept in the field until it is complete. */ }
  return <Dialog title={title} busy={busy || addingFeed} close={close}><form onSubmit={submit} className="edit-form"><fieldset disabled={busy || addingFeed || uncertain} className="form-fields">
    {editor.type === 'farm' ? <Field label="Tên trại"><input autoFocus required maxLength={120} value={name} placeholder="Ví dụ: Trại sau nhà" onChange={e => setName(e.target.value)} /></Field> : null}
    {editor.type === 'batch' ? <><Field label="Tên đợt nuôi"><input autoFocus required maxLength={120} value={name} placeholder="Ví dụ: Đợt tháng 10/2026" onChange={e => setName(e.target.value)} /></Field><Field label="Ngày bắt đầu"><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Field label="Số heo giống (con)"><Numeric value={pigs} onChange={setPigs} integer /></Field><Field label="Tổng tiền giống (đồng)" hint="Nhập tổng tiền, ví dụ 50000000. Không dùng dấu chấm phân cách."><Numeric value={amount} onChange={setAmount} zero /></Field></> : null}
    {editor.type === 'end' ? <><p>Chốt đợt <strong>{editor.batch.name}</strong>, bắt đầu {dateLabel(editor.batch.startDate)}. Sau khi kết thúc vẫn có thể bổ sung và sửa thu chi.</p><Field label="Ngày kết thúc"><input required type="date" min={editor.batch.startDate} value={date} onChange={e => setDate(e.target.value)} /></Field></> : null}
    {editor.type === 'entry' ? <>
      <p className="form-context">{editor.batch.name}</p>
      {editor.kind === 'labor' ? <><Field label="Tháng tính tiền công"><input type="month" required value={month} onChange={e => chooseMonth(e.target.value)} /></Field>{target?.month === month ? <p className="hint">Tháng này đã ghi tiền công. Bạn đang sửa khoản cũ.</p> : null}<p className="muted">Nếu cùng tháng có hai đợt, gia đình tự chia tiền công cho từng đợt.</p></> : null}
      {editor.kind !== 'labor' ? <Field label="Ngày ghi nhận"><input required type="date" value={date} onChange={e => setDate(e.target.value)} /></Field> : null}
      {editor.kind === 'feed' ? <><div className="feed-lines">{lines.map((line, index) => <section className="feed-line" key={index}><div className="row spread"><h3>Loại cám {index + 1}</h3>{lines.length > 1 ? <button className="text-danger" type="button" onClick={() => setLines(old => old.filter((_, i) => i !== index))} aria-label={`Bỏ dòng cám ${index + 1}`}>Bỏ dòng</button> : null}</div><Field label="Loại cám"><select required value={line.feedTypeId} onChange={e => selectFeed(index, e.target.value)}><option value="">Chọn loại cám</option>{feedTypes.map(feed => <option key={feed.id} value={feed.id}>{feed.name}</option>)}</select></Field><Field label="Số bao"><Numeric integer value={line.bags} onChange={bags => updateLine(index, { bags })} /></Field><Field label="Giá mỗi bao (đồng)"><Numeric value={line.price} onChange={price => updateLine(index, { price })} zero /></Field><Field label="Chiết khấu mỗi bao (đồng)"><Numeric value={line.discount} onChange={discount => updateLine(index, { discount })} zero /></Field></section>)}</div><button className="secondary" type="button" onClick={() => setLines(old => [...old, blankLine(feedTypes[0])])}>＋ Thêm dòng cám</button><details className="quick-add"><summary>＋ Thêm loại cám mới vào danh mục</summary><div className="stack"><Field label="Tên loại cám mới"><input disabled={feedUncertain} value={newFeedName} maxLength={120} onChange={e => setNewFeedName(e.target.value)} placeholder="Ví dụ: Cám heo thịt 01" /></Field>{feedError ? <p className="error" role="alert">{feedError}</p> : null}<button type="button" className="secondary" disabled={!newFeedName.trim() || addingFeed} onClick={addFeed}>{addingFeed ? 'Đang thêm…' : 'Lưu loại cám mới'}</button></div></details></> : null}
      {editor.kind === 'sale' ? <><Field label="Số heo bán (con)"><Numeric integer value={pigs} onChange={setPigs} /></Field><Field label="Tổng trọng lượng (kg)" hint="Có thể nhập số lẻ, ví dụ 1250,5."><Numeric value={kg} onChange={setKg} /></Field><Field label="Giá bán mỗi kg (đồng)"><Numeric value={price} onChange={setPrice} /></Field></> : null}
      {editor.kind === 'other' || editor.kind === 'labor' ? <Field label={editor.kind === 'labor' ? 'Tổng tiền công của đợt trong tháng (đồng)' : 'Số tiền (đồng)'}><Numeric value={amount} onChange={setAmount} zero /></Field> : null}
      <Field label={editor.kind === 'other' ? 'Nội dung chi phí' : 'Ghi chú (không bắt buộc)'}><textarea required={editor.kind === 'other'} rows={2} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} placeholder={editor.kind === 'other' ? 'Ví dụ: Thuốc, điện nước, vận chuyển…' : 'Ghi thêm để dễ nhớ'} /></Field>
      {preview ? <div className="preview-total"><span>Tổng tiền dự tính</span><strong>{preview}</strong></div> : null}
    </> : null}
  </fieldset>{error ? <div className="error" role="alert"><p>{error}</p>{conflict ? <><p>Tải bản mới trước khi sửa tiếp. Nội dung trong biểu mẫu sẽ được thay bằng bản trên máy chủ.</p><button className="secondary" type="button" onClick={() => reload(editor.type === 'entry' && editor.kind === 'labor' ? month : undefined)}>Tải bản mới để sửa</button></> : null}</div> : null}<div className="form-actions"><button className="secondary" type="button" disabled={busy || addingFeed} onClick={close}>Để sau</button><button className="primary" type="submit" disabled={busy || addingFeed || conflict || feedUncertain}>{busy ? 'Đang lưu…' : uncertain ? 'Thử xác nhận lưu lại' : editor.type === 'end' ? 'Xác nhận kết thúc' : 'Lưu vào sổ'}</button></div><p className="form-note">Cần có mạng để lưu. Máy chủ sẽ kiểm tra và tính lại số tiền.</p></form></Dialog>;
}
function blankLine(feed?: FeedType): DraftLine { return { feedTypeId: feed?.id || '', name: feed?.name || '', bags: '', price: feed?.lastPrice || '', discount: feed?.lastDiscount || '0' }; }
