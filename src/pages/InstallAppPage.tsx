import { Download, ExternalLink, Home, MoreVertical, Share, Smartphone } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { mobilePlatform } from '../utils/device';

function IosVisual() {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[46px] border-[10px] border-[#1c1c1e] bg-[#1c1c1e] shadow-lift">
      <div className="relative aspect-[9/19] overflow-hidden rounded-[34px] bg-[#f2f2f7]">
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-[#1c1c1e]" />
        <div className="h-full px-3 pb-4 pt-10">
          <div className="h-full overflow-hidden rounded-[28px] bg-white">
            <div className="p-4">
              <div className="rounded-3xl bg-[#edf0e8] p-3">
                <img src="./pwa-icon.svg" alt="" className="h-14 w-14 rounded-2xl shadow-soft" />
                <div className="mt-4 h-4 w-32 rounded-full bg-ink/20" />
                <div className="mt-2 h-3 w-44 rounded-full bg-ink/10" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 rounded-t-[28px] bg-white/95 p-3 shadow-lift">
              <div className="mb-3 flex items-center justify-around rounded-2xl bg-[#f2f2f7] px-3 py-3">
                <Share size={22} className="text-[#007aff]" />
                <Home size={22} className="text-[#007aff]" />
                <ExternalLink size={22} className="text-[#007aff]" />
              </div>
              <div className="rounded-2xl bg-[#f2f2f7] p-2">
                <div className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
                  <Home size={18} className="text-[#007aff]" />
                  <span className="text-xs font-black">Add to Home Screen</span>
                </div>
                <div className="mt-2 h-8 rounded-xl bg-white" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AndroidVisual() {
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[38px] border-[10px] border-[#202124] bg-[#202124] shadow-lift">
      <div className="relative aspect-[9/19] overflow-hidden rounded-[28px] bg-white">
        <div className="flex items-center gap-2 bg-white px-3 pb-2 pt-5 shadow-soft">
          <span className="h-4 w-4 rounded-full bg-[#34a853]" />
          <div className="flex-1 rounded-full bg-[#f1f3f4] px-3 py-2 text-[10px] font-bold text-ink/45">called it</div>
          <MoreVertical size={18} className="text-[#5f6368]" />
        </div>
        <div className="p-4">
          <div className="rounded-3xl bg-[#edf0e8] p-3">
            <img src="./pwa-icon.svg" alt="" className="h-14 w-14 rounded-2xl shadow-soft" />
            <div className="mt-4 h-4 w-32 rounded-full bg-ink/20" />
            <div className="mt-2 h-3 w-44 rounded-full bg-ink/10" />
          </div>
        </div>
        <div className="absolute bottom-5 left-4 right-4 rounded-3xl border border-[#dadce0] bg-white p-4 shadow-lift">
          <div className="flex items-center gap-3">
            <img src="./pwa-icon.svg" alt="" className="h-10 w-10 rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black">Install Called It?</div>
              <div className="mt-1 text-[11px] font-semibold text-ink/45">Add to Home screen</div>
            </div>
            <Download size={20} className="text-[#1a73e8]" />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <span className="rounded-full px-3 py-2 text-xs font-black text-[#1a73e8]">Cancel</span>
            <span className="rounded-full bg-[#1a73e8] px-3 py-2 text-xs font-black text-white">Install</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function InstallAppPage() {
  const platform = mobilePlatform();
  const primary = platform === 'ios'
    ? {
        title: 'Install on iPhone',
        steps: ['Open this app in Safari.', 'Tap the Share button.', 'Tap Add to Home Screen.', 'Open Called It from your Home Screen and enable notifications in Profile.'],
        visual: <IosVisual />,
      }
    : {
        title: 'Install on Android',
        steps: ['Open this app in Chrome.', 'Tap Install app, or open the three-dot menu.', 'Confirm Install.', 'Open Called It from the app icon and enable notifications in Profile.'],
        visual: <AndroidVisual />,
      };

  const secondary = platform === 'ios'
    ? {
        title: 'Android friends',
        steps: ['Use Chrome.', 'Tap Install app or the three-dot menu.', 'Confirm Install.'],
        visual: <AndroidVisual />,
      }
    : {
        title: 'iPhone friends',
        steps: ['Use Safari.', 'Tap Share.', 'Tap Add to Home Screen.'],
        visual: <IosVisual />,
      };

  return (
    <>
      <PageHeader title="Install App" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-md border border-line bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink text-white">
              <Smartphone size={20} />
            </div>
            <div>
              <h2 className="text-xl font-black">{primary.title}</h2>
              <p className="mt-1 text-sm leading-6 text-ink/60">
                Installing makes Called It feel like a normal app, keeps it one tap away, and enables closed-app push notifications on supported browsers.
              </p>
            </div>
          </div>
          <ol className="mt-5 grid gap-2">
            {primary.steps.map((step, index) => (
              <li key={step} className="flex items-center gap-3 rounded-md bg-field px-3 py-2 text-sm font-semibold">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-ink/55">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <a
            href="https://kateonbxsh.github.io/CalledIt/"
            className="btn-special mt-5 inline-flex items-center gap-2 rounded-md px-4 py-3 text-sm font-bold"
          >
            <ExternalLink size={16} /> Open live app
          </a>
        </section>
        <aside className="rounded-md border border-line bg-white p-4">
          {primary.visual}
        </aside>
        <section className="rounded-md border border-line bg-white p-4 lg:col-span-2">
          <h2 className="font-black">{secondary.title}</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
            {secondary.visual}
            <ol className="grid content-start gap-2">
              {secondary.steps.map((step, index) => (
                <li key={step} className="flex items-center gap-3 rounded-md bg-field px-3 py-2 text-sm font-semibold">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-black text-ink/55">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </>
  );
}
