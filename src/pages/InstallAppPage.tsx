import { Download, ExternalLink, Home, MoreVertical, Share, Smartphone } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { mobilePlatform } from '../utils/device';

function IosVisual() {
  return (
    <div className="mx-auto aspect-square w-full max-w-[320px] rounded-[42px] border border-line bg-[#f6f7fb] p-4 shadow-lift">
      <div className="h-full rounded-[32px] bg-white p-3">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-ink/15" />
        <div className="overflow-hidden rounded-3xl border border-[#d8dce6] bg-[#f8f9fd]">
          <div className="flex items-center gap-2 border-b border-[#d8dce6] bg-white px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            <div className="ml-auto rounded-full bg-[#eef1f7] px-3 py-1 text-[10px] font-bold text-ink/45">called it</div>
          </div>
          <div className="p-4">
            <div className="mb-4 h-16 rounded-2xl bg-[#edf0e8]" />
            <div className="rounded-3xl border border-[#d8dce6] bg-white p-3 shadow-soft">
              <div className="mb-3 flex items-center justify-between">
                <div className="h-3 w-20 rounded-full bg-ink/20" />
                <Share size={18} className="text-[#007aff]" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-2xl bg-[#f2f2f7] px-3 py-2">
                  <Home size={17} className="text-[#007aff]" />
                  <span className="text-xs font-black">Add to Home Screen</span>
                </div>
                <div className="h-9 rounded-2xl bg-[#f2f2f7]" />
                <div className="h-9 rounded-2xl bg-[#f2f2f7]" />
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
    <div className="mx-auto aspect-square w-full max-w-[320px] rounded-[34px] border border-line bg-[#edf4ff] p-4 shadow-lift">
      <div className="h-full rounded-[28px] bg-white p-3">
        <div className="mb-3 flex items-center gap-2 rounded-full bg-[#f1f3f4] px-3 py-2">
          <span className="h-4 w-4 rounded-full bg-[#34a853]" />
          <div className="h-2 flex-1 rounded-full bg-ink/15" />
          <MoreVertical size={16} className="text-ink/55" />
        </div>
        <div className="grid h-[calc(100%-44px)] place-items-center rounded-3xl bg-[#f8fbff] p-4">
          <div className="w-full rounded-3xl border border-[#dfe4ea] bg-white p-3 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="h-3 w-24 rounded-full bg-ink/20" />
                <div className="mt-2 h-2 w-16 rounded-full bg-ink/10" />
              </div>
              <Download size={20} className="text-[#1a73e8]" />
            </div>
            <div className="rounded-2xl bg-[#e8f0fe] px-3 py-2 text-xs font-black text-[#1a73e8]">
              Install app
            </div>
            <div className="mt-2 h-9 rounded-2xl bg-[#f1f3f4]" />
            <div className="mt-2 h-9 rounded-2xl bg-[#f1f3f4]" />
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
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm font-bold text-white"
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
