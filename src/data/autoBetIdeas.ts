import type { BetOption, BetType } from '../types';

export type AutoBetAccent = 'sky' | 'plum' | 'coral' | 'mint' | 'citrus';
export type AutoBetDeadline = 'today' | 'week';
export type AutoBetType = Extract<BetType, 'binary' | 'multi' | 'overUnder' | 'closestNumber'>;

export interface AutoBetIdea {
  id: string;
  type: AutoBetType;
  title: string;
  description: string;
  category: string;
  accent: AutoBetAccent;
  deadline: AutoBetDeadline;
  options: BetOption[];
  unit?: string;
  personal?: boolean;
}

const YES_NO: BetOption[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function idea(
  type: AutoBetType,
  title: string,
  description: string,
  category: string,
  accent: AutoBetAccent,
  options: BetOption[],
  extra: Partial<Pick<AutoBetIdea, 'deadline' | 'unit' | 'personal'>> = {},
): AutoBetIdea {
  return {
    id: slug(`${type}-${category}-${title}`),
    type,
    title,
    description,
    category,
    accent,
    options,
    deadline: extra.deadline ?? 'today',
    unit: extra.unit,
    personal: extra.personal,
  };
}

function binary(
  title: string,
  description: string,
  category: string,
  accent: AutoBetAccent,
  extra?: Partial<Pick<AutoBetIdea, 'deadline' | 'personal'>>,
) {
  return idea('binary', title, description, category, accent, YES_NO, extra);
}

function multi(
  title: string,
  description: string,
  category: string,
  accent: AutoBetAccent,
  labels: string[],
  extra?: Partial<Pick<AutoBetIdea, 'deadline' | 'personal'>>,
) {
  return idea(
    'multi',
    title,
    description,
    category,
    accent,
    labels.map((label) => ({ id: slug(label), label })),
    extra,
  );
}

function overUnder(
  title: string,
  description: string,
  category: string,
  accent: AutoBetAccent,
  line: string,
  extra?: Partial<Pick<AutoBetIdea, 'deadline' | 'personal'>>,
) {
  return idea('overUnder', title, description, category, accent, [
    { id: 'over', label: `Over ${line}` },
    { id: 'under', label: `Under ${line}` },
  ], extra);
}

function closestNumber(
  title: string,
  description: string,
  category: string,
  accent: AutoBetAccent,
  unit?: string,
  extra?: Partial<Pick<AutoBetIdea, 'deadline' | 'personal'>>,
) {
  return idea('closestNumber', title, description, category, accent, [], { ...extra, unit });
}

function buildIdeas() {
  const ideas: AutoBetIdea[] = [];
  const cities = [
    'Toulouse', 'Paris', 'London', 'Madrid', 'Barcelona', 'Lisbon', 'Rome', 'Milan',
    'Berlin', 'Amsterdam', 'Brussels', 'Dublin', 'Vienna', 'Prague', 'Athens', 'Oslo',
  ];

  for (const city of cities) {
    ideas.push(
      closestNumber(
        `What will be the highest temperature in ${city} today?`,
        `Closest guess to the recorded daily high in ${city} wins.`,
        'Weather',
        'sky',
        '°C',
      ),
      closestNumber(
        `What will be the lowest temperature in ${city} today?`,
        `Closest guess to the recorded daily low in ${city} wins.`,
        'Weather',
        'sky',
        '°C',
      ),
      binary(
        `Will it rain in ${city} today?`,
        `Any recorded precipitation in ${city} counts.`,
        'Weather',
        'sky',
      ),
      overUnder(
        `Will ${city}'s high be over or under 20°C today?`,
        `Resolve from the recorded daily high in ${city}.`,
        'Weather',
        'sky',
        '20°C',
      ),
    );
    for (const temperature of [15, 20, 25, 30]) {
      ideas.push(binary(
        `Will ${city} reach ${temperature}°C today?`,
        `Resolve from the recorded daily high in ${city}.`,
        'Weather',
        'sky',
      ));
    }
  }

  const personalBinaryTargets = [
    ['walk at least 5,000 steps', 'a phone or fitness tracker'],
    ['walk at least 10,000 steps', 'a phone or fitness tracker'],
    ['drink at least two coffees', 'the final cup count'],
    ['spend less than two hours on social media', 'the phone screen-time report'],
    ['finish the main task of the day', 'whether the task is completed'],
    ['cook instead of ordering food', 'what happened by the end of the day'],
    ['exercise for at least 30 minutes', 'a workout or activity record'],
    ['go to bed before midnight', 'the actual bedtime'],
    ['receive more than 20 messages', 'the final message count'],
    ['listen to music for over an hour', 'the listening-time total'],
    ['avoid buying anything unnecessary', 'the final purchases for the day'],
    ['complete every item on the short to-do list', 'the completed to-do list'],
    ['eat breakfast before 10:00', 'the first meal of the day'],
    ['leave home before noon', 'the first time outside'],
    ['take a photo today', 'the photo library'],
  ];
  for (const [target, evidence] of personalBinaryTargets) {
    ideas.push(binary(
      `Will I ${target} today?`,
      `Resolve using ${evidence}.`,
      'Daily life',
      'mint',
      { personal: true },
    ));
  }

  ideas.push(
    closestNumber('How many steps will I take today?', 'Closest guess to the final tracker count wins.', 'Daily life', 'mint', 'steps', { personal: true }),
    closestNumber('How many coffees will I drink today?', 'Closest guess to the final cup count wins.', 'Daily life', 'mint', 'coffees', { personal: true }),
    closestNumber('How many minutes of screen time will I have today?', 'Closest guess to the phone screen-time report wins.', 'Digital life', 'plum', 'minutes', { personal: true }),
    closestNumber('How many messages will I receive today?', 'Closest guess to the final message count wins.', 'Digital life', 'plum', 'messages', { personal: true }),
    overUnder('Will I take over or under 8,000 steps today?', 'Resolve from a phone or fitness tracker.', 'Daily life', 'mint', '8,000 steps', { personal: true }),
    overUnder('Will I spend over or under 3 hours on my phone today?', 'Resolve from the phone screen-time report.', 'Digital life', 'plum', '3 hours', { personal: true }),
    multi('What will I drink first today?', 'Resolve after the first drink.', 'Daily life', 'mint', ['Coffee', 'Tea', 'Water', 'Something else'], { personal: true }),
    multi('What will be my main meal tonight?', 'Resolve from the main evening meal.', 'Daily life', 'mint', ['Home cooked', 'Restaurant', 'Delivery', 'Skipped'], { personal: true }),
    multi('How will my day feel by the end?', 'Pick the closest overall mood.', 'Daily life', 'mint', ['Great', 'Good', 'Average', 'Rough'], { personal: true }),
    multi('Which app will I use most today?', 'Resolve from screen-time totals.', 'Digital life', 'plum', ['Messaging', 'Social', 'Video', 'Music', 'Other'], { personal: true }),
    multi('What will interrupt me first?', 'Resolve on the first interruption.', 'Work & study', 'plum', ['Message', 'Call', 'Person', 'Notification', 'Nothing'], { personal: true }),
    multi('When will I finish my main task?', 'Resolve when the task is done.', 'Work & study', 'plum', ['Before noon', '12:00-15:00', '15:00-18:00', 'After 18:00', 'Not today'], { personal: true }),
  );

  ideas.push(
    binary('Will I go to the gym today?', 'Resolve when the day ends.', 'Gym', 'coral', { personal: true }),
    binary('Will I complete the full planned workout today?', 'Every planned working set must be completed.', 'Gym', 'coral', { personal: true }),
    binary('Will I hit a personal record this week?', 'Any clearly measured weight, rep, distance, or time record counts.', 'Gym', 'coral', { deadline: 'week', personal: true }),
    binary('Will I train legs this week?', 'Any dedicated leg session counts.', 'Gym', 'coral', { deadline: 'week', personal: true }),
    binary('Will I do cardio after lifting today?', 'At least ten minutes of cardio after the lifting session counts.', 'Gym', 'coral', { personal: true }),
    binary('Will I stay at the gym for more than one hour?', 'Resolve from the door-to-door gym session time.', 'Gym', 'coral', { personal: true }),
    overUnder('Will I do over or under 20 working sets today?', 'Count completed working sets, excluding warmups.', 'Gym', 'coral', '20 sets', { personal: true }),
    overUnder('Will my workout last over or under 75 minutes?', 'Resolve from the full session duration.', 'Gym', 'coral', '75 minutes', { personal: true }),
    closestNumber('How many working sets will I complete today?', 'Closest guess to completed working sets wins.', 'Gym', 'coral', 'sets', { personal: true }),
    closestNumber('How many minutes will my workout last?', 'Closest guess to the full session duration wins.', 'Gym', 'coral', 'minutes', { personal: true }),
    closestNumber('What will be my heaviest lift today?', 'Closest guess to the heaviest successfully completed weight wins.', 'Gym', 'coral', 'kg', { personal: true }),
    multi('What will I train first?', 'Resolve from the first main exercise or muscle group.', 'Gym', 'coral', ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Cardio'], { personal: true }),
    multi('How will my workout feel?', 'Resolve from the honest post-workout rating.', 'Gym', 'coral', ['Excellent', 'Good', 'Average', 'Bad', 'Skipped'], { personal: true }),

    binary('Will I hang out with friends tonight?', 'A real in-person hangout counts.', 'Hangouts', 'citrus', { personal: true }),
    binary('Will I make spontaneous plans today?', 'Plans made on the same day count as spontaneous.', 'Hangouts', 'citrus', { personal: true }),
    binary('Will I stay out past midnight this week?', 'Resolve after the first qualifying night or at week end.', 'Hangouts', 'citrus', { deadline: 'week', personal: true }),
    binary('Will I cancel or postpone plans this week?', 'Any plan moved to another day or cancelled counts.', 'Hangouts', 'citrus', { deadline: 'week', personal: true }),
    closestNumber('How many people will be at my next hangout?', 'Closest guess to the largest number present at once wins.', 'Hangouts', 'citrus', 'people', { personal: true }),
    closestNumber('How many hours will my next hangout last?', 'Closest guess to the full hangout duration wins.', 'Hangouts', 'citrus', 'hours', { personal: true }),
    multi('Where will I hang out next?', 'Resolve from the main location.', 'Hangouts', 'citrus', ['Someone\'s home', 'Cafe', 'Restaurant', 'Bar', 'Outside', 'Somewhere else'], { personal: true }),
    multi('What will my group do first?', 'Resolve from the first main activity.', 'Hangouts', 'citrus', ['Eat', 'Get drinks', 'Walk around', 'Play games', 'Watch something', 'Just talk'], { personal: true }),
    multi('When will I get home from the next hangout?', 'Resolve when the hangout ends.', 'Hangouts', 'citrus', ['Before 22:00', '22:00-00:00', '00:00-02:00', 'After 02:00'], { personal: true }),

    binary('Will I talk to a girl I like today?', 'A real conversation, in person or by message, counts.', 'Dating', 'plum', { personal: true }),
    binary('Will I message someone I like first today?', 'Resolve from who sends the first message.', 'Dating', 'plum', { personal: true }),
    binary('Will I get a girl\'s number this week?', 'A newly exchanged phone number counts.', 'Dating', 'plum', { deadline: 'week', personal: true }),
    binary('Will I ask someone out this week?', 'A clear invitation to a one-on-one date counts.', 'Dating', 'plum', { deadline: 'week', personal: true }),
    binary('Will I go on a date this week?', 'A planned one-on-one date counts.', 'Dating', 'plum', { deadline: 'week', personal: true }),
    binary('Will I receive a flirty message today?', 'Resolve honestly from the conversation context.', 'Dating', 'plum', { personal: true }),
    closestNumber('How many new people will I talk to tonight?', 'Closest guess to genuine new conversations wins.', 'Dating', 'plum', 'people', { personal: true }),
    multi('Who sends the next message?', 'Resolve from the next message in the relevant conversation.', 'Dating', 'plum', ['Me', 'Them', 'Nobody today'], { personal: true }),
    multi('How will my next date or one-on-one hangout go?', 'Resolve from the honest overall impression.', 'Dating', 'plum', ['Great', 'Good', 'Average', 'Awkward', 'Cancelled'], { personal: true }),
  );

  const workTargets = [
    'finish the planned work before 18:00',
    'have an interruption-free focus block',
    'clear the important inbox messages',
    'complete more tasks than yesterday',
    'start the hardest task before noon',
    'take a proper lunch break',
    'finish without carrying work into the evening',
    'spend at least 90 minutes in deep work',
  ];
  for (const target of workTargets) {
    ideas.push(binary(
      `Will I ${target} today?`,
      'A small, resolvable bet for the working day.',
      'Work & study',
      'plum',
      { personal: true },
    ));
  }

  ideas.push(
    multi('What kind of entertainment wins tonight?', 'Resolve from the main evening activity.', 'Entertainment', 'coral', ['Movie', 'Series', 'Gaming', 'Music', 'None']),
    multi('What will be played first tonight?', 'Resolve from the first evening pick.', 'Entertainment', 'coral', ['Movie', 'Series', 'Game', 'Music', 'Nothing']),
    binary('Will a new song be added to a playlist today?', 'Any newly saved track counts.', 'Entertainment', 'coral'),
    binary('Will someone suggest going out today?', 'Any sincere plan or invitation counts.', 'Social', 'citrus'),
    binary('Will a group chat pass 50 messages today?', 'Use the final message count in any one group.', 'Social', 'citrus'),
    binary('Will plans change at least once today?', 'A changed time, place, or cancellation counts.', 'Social', 'citrus'),
    closestNumber('How many messages will the busiest group chat get today?', 'Closest guess to the final message count wins.', 'Social', 'citrus', 'messages'),
    multi('Who starts the next group conversation?', 'Resolve from the next new conversation.', 'Social', 'citrus', ['Me', 'A close friend', 'Someone else', 'Nobody today']),
    multi('What happens first today?', 'Resolve as soon as one event occurs.', 'Daily life', 'mint', ['A phone call', 'A coffee', 'A snack', 'A walk outside']),
    multi('What will the sky look like at sunset?', 'Resolve from the visible conditions at sunset.', 'Weather', 'sky', ['Clear', 'Partly cloudy', 'Cloudy', 'Rainy']),
    overUnder('Will the next commute take over or under 30 minutes?', 'Resolve when the trip ends.', 'Travel', 'citrus', '30 minutes'),
    closestNumber('How many minutes will the next commute take?', 'Closest guess to the door-to-door time wins.', 'Travel', 'citrus', 'minutes'),
    multi('What transport will be used next?', 'Resolve from the next meaningful trip.', 'Travel', 'citrus', ['Walking', 'Car', 'Public transport', 'Bike', 'Other']),
    closestNumber('How many goals will be scored in the next match we watch?', 'Closest total-goals guess wins.', 'Sports', 'coral', 'goals'),
    overUnder('Will the next match have over or under 2.5 goals?', 'Resolve from the final score.', 'Sports', 'coral', '2.5 goals'),
    multi('What decides the next match we watch?', 'Resolve from the final result.', 'Sports', 'coral', ['Home win', 'Draw', 'Away win']),
  );

  const weeklyTargets = [
    'exercise three times', 'cook four meals', 'finish a book or audiobook', 'have one screen-free evening',
    'meet a friend in person', 'complete every planned workout', 'spend less than planned',
    'finish the week with an empty important inbox', 'try somewhere new', 'beat last week\'s step count',
  ];
  for (const target of weeklyTargets) {
    ideas.push(binary(
      `Will I ${target} this week?`,
      'Resolve at the end of the week.',
      'This week',
      'citrus',
      { deadline: 'week', personal: true },
    ));
  }

  return ideas;
}

export function autoBetDeadline(kind: AutoBetDeadline) {
  const deadline = new Date();
  if (kind === 'week') deadline.setDate(deadline.getDate() + 7);
  deadline.setHours(23, 59, 59, 999);
  return deadline;
}

export function sampleAutoBetIdeas(count = 18) {
  const pool = buildIdeas();
  const shuffle = (items: AutoBetIdea[]) => {
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
  };
  const selected = ['Weather', 'Gym', 'Hangouts', 'Dating', 'Daily life']
    .flatMap((category) => shuffle(pool.filter((item) => item.category === category)).slice(0, 1));
  const selectedIds = new Set(selected.map((item) => item.id));
  for (const type of ['binary', 'multi', 'overUnder', 'closestNumber'] as AutoBetType[]) {
    for (const candidate of shuffle(pool.filter((item) => item.type === type && !selectedIds.has(item.id))).slice(0, 3)) {
      selected.push(candidate);
      selectedIds.add(candidate.id);
    }
  }
  for (const candidate of shuffle(pool.filter((item) => !selectedIds.has(item.id)))) {
    if (selected.length >= count) break;
    selected.push(candidate);
  }
  return shuffle(selected).slice(0, count);
}
