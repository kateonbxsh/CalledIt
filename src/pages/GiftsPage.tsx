import { FormEvent, useEffect, useState } from 'react';
import { Gift, Send } from 'lucide-react';
import { CoinAmount } from '../components/CoinAmount';
import { PageHeader } from '../components/PageHeader';
import { StakeInput } from '../components/StakeInput';
import { UsernamePicker } from '../components/UsernamePicker';
import { useAuth } from '../contexts/AuthContext';
import { claimCoinGift, listIncomingCoinGifts, sendCoinGift } from '../services/coinGiftService';
import { getUserByUsername } from '../services/userService';
import type { CoinGift } from '../types';

export function GiftsPage() {
  const { profile } = useAuth();
  const [incomingGifts, setIncomingGifts] = useState<CoinGift[]>([]);
  const [giftRecipients, setGiftRecipients] = useState<string[]>([]);
  const [giftAmount, setGiftAmount] = useState(100);
  const [giftNote, setGiftNote] = useState('');
  const [giftBusy, setGiftBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!profile) return;
    listIncomingCoinGifts(profile.uid).then(setIncomingGifts).catch(() => setIncomingGifts([]));
  }, [profile?.uid]);

  async function submitGift(event: FormEvent) {
    event.preventDefault();
    if (!profile) return;
    const recipientUsername = giftRecipients[0];
    if (!recipientUsername) {
      setMessage('Choose someone first.');
      return;
    }
    setGiftBusy(true);
    setMessage('');
    try {
      const recipient = await getUserByUsername(recipientUsername);
      if (!recipient) throw new Error('That user could not be found.');
      await sendCoinGift({
        sender: profile,
        recipient,
        amount: giftAmount,
        note: giftNote,
      });
      setGiftRecipients([]);
      setGiftNote('');
      setMessage(`Gift sent to ${recipient.displayName || recipient.username}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not send the gift.');
    } finally {
      setGiftBusy(false);
    }
  }

  async function claimGift(gift: CoinGift) {
    if (!profile) return;
    setGiftBusy(true);
    setMessage('');
    try {
      await claimCoinGift(profile, gift);
      setIncomingGifts((current) => current.filter((item) => item.id !== gift.id));
      setMessage(`Claimed ${gift.amount.toLocaleString('en-US')}€ from ${gift.senderDisplayName || gift.senderUsername}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not claim the gift.');
    } finally {
      setGiftBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Gifts" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-md border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="flex items-center gap-2">
            <Gift size={18} className="text-citrus" />
            <h2 className="font-black">Incoming gifts</h2>
          </div>
          <p className="mt-1 text-sm text-ink/55">
            Claim euros sent to you by friends.
          </p>
          <div className="mt-4 space-y-3">
            {incomingGifts.length ? incomingGifts.map((gift) => (
              <div key={gift.id} className="flex flex-col gap-3 rounded-md border border-line bg-field p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-bold">{gift.senderDisplayName || gift.senderUsername}</p>
                  <p className="mt-1 text-sm text-ink/60">
                    Sent you <CoinAmount amount={gift.amount} className="text-sm" />
                    {gift.note ? <span className="text-ink/50"> - {gift.note}</span> : null}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => claimGift(gift)}
                  disabled={giftBusy}
                  className="rounded-md bg-citrus px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  Claim
                </button>
              </div>
            )) : (
              <div className="rounded-md border border-dashed border-line bg-field/70 p-5 text-sm text-ink/50">
                No gifts waiting right now.
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-md border border-line bg-white p-4 shadow-soft sm:p-5">
          <div className="flex items-center gap-2">
            <Send size={17} className="text-sky" />
            <h2 className="font-black">Send euros</h2>
          </div>
          <p className="mt-1 text-sm text-ink/55">
            Send euros directly to a friend by username.
          </p>
          <form onSubmit={submitGift} className="mt-4 space-y-3">
            <UsernamePicker
              value={giftRecipients}
              onChange={(next) => setGiftRecipients(next.slice(0, 1))}
              exclude={profile?.username ? [profile.username] : []}
              placeholder="Search one username"
            />
            <StakeInput
              label="Amount"
              value={giftAmount}
              min={0}
              step={1}
              onChange={(value) => setGiftAmount(Math.max(0, Math.round(value)))}
            />
            <label className="block text-sm font-medium">
              Note
              <input
                className="mt-1 w-full rounded-md border border-line bg-field px-3 py-2 outline-none focus:border-mint"
                value={giftNote}
                onChange={(event) => setGiftNote(event.target.value)}
                maxLength={200}
                placeholder="Optional"
              />
            </label>
            {message ? <p className="rounded-md bg-mint/10 p-3 text-sm font-semibold text-mint">{message}</p> : null}
            <button disabled={giftBusy || !giftRecipients.length} className="btn-special w-full rounded-md px-4 py-2.5 text-sm font-bold disabled:opacity-50">
              {giftBusy ? 'Sending...' : 'Send gift'}
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
