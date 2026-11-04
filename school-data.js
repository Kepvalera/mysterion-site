/* Public school content. Leave unconfirmed fields empty.
 * Localized text: {ru: "…", en: "…", de: "…"}.
 * Speaker: {id, name: {ru,en,de}, bio: {ru,en,de}, photo: "assets/school/…", photoPosition: "center"}.
 * Lesson: {id, title: {ru,en,de}, description: {ru,en,de}, speakerIds: []}.
 * Add speakers to speakers[], then reference their IDs in each cohort.
 * Only cohorts 3–6 are included: recordings of cohorts 1 and 2 are unavailable.
 * Preserve original cohort numbers and IDs when editing this catalog.
 * This file is public: never put private recordings or student data here.
 */
window.MYSTERION_SCHOOL = {
  speakers: [],
  cohorts: [3, 4, 5, 6].map(number => ({
    id: `cohort-${number}`,
    number,
    status: 'completed',
    title: {ru: `Поток ${number}`, en: `Cohort ${number}`, de: `Jahrgang ${number}`},
    description: {ru: '', en: '', de: ''},
    dates: {start: '', end: ''},
    cover: '',
    speakerIds: [],
    lessons: []
  }))
};
