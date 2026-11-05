/**
 * The course map: every chapter and every planned lesson, written or not.
 *
 * Written lessons live in src/content/lessons as MDX; this list is the order and the
 * promise. The table of contents shows planned lessons as "coming soon", so the student
 * always sees the whole road (Ministry syllabus, 5 units, Bagrut paper 036361), plus one
 * bridge chapter beyond the Bagrut that leads into first-year university mechanics.
 *
 * Chapters run in teaching order; the Ministry syllabus numbers them differently (SHM is its
 * chapter 6, gravitation 7, the ideal gas 5). The plan (.claude/plan.md) keeps the mapping.
 */

export interface PlannedLesson {
  id: string;
  title: string;
}

export interface Chapter {
  n: number;
  title: string;
  /** one line under the chapter title on the contents page */
  blurb: string;
  /** syllabus hours, from the Ministry programme */
  hours?: number;
  /** above the Bagrut: not in the syllabus, labelled so on the contents page and in its lessons */
  beyondBagrut?: boolean;
  lessons: PlannedLesson[];
}

export const chapters: Chapter[] = [
  {
    n: 0,
    title: 'יוצאים לדרך',
    blurb: 'איך לומדים בקורס, וארגז הכלים שכל פרק משתמש בו.',
    lessons: [
      { id: '0.1', title: 'איך לומדים בקורס הזה' },
      { id: '0.2', title: 'יחידות, כתיב מדעי והצגת פתרון' },
      { id: '0.3', title: 'ארגז כלים מתמטי: יחס, שיפוע וטריגונומטריה' },
      { id: '0.4', title: 'גרפים וליניאריזציה' },
    ],
  },
  {
    n: 1,
    title: 'קינמטיקה: תיאור התנועה',
    blurb: 'איפה הגוף, כמה מהר ולאן: תרשים עקבות, טבלה, גרף ונוסחה.',
    lessons: [
      { id: '1.1', title: 'מקום, מערכת ייחוס והעתק' },
      { id: '1.2', title: 'ארבע דרכים לתאר תנועה' },
      { id: '1.3', title: 'תנועה קצובה' },
      { id: '1.4', title: 'יחסיות התנועה ומהירות יחסית' },
      { id: '1.5', title: 'מהירות רגעית: ממיתר למשיק' },
      { id: '1.6', title: 'תאוצה ותנועה בתאוצה קבועה' },
      { id: '1.7', title: 'נפילה חופשית וזריקה אנכית' },
      { id: '1.8', title: 'בין הגרפים: שיפוע ושטח' },
      { id: '1.9', title: 'וקטורים: חיבור, חיסור ורכיבים' },
      { id: '1.10', title: 'מהירות ותאוצה במישור' },
    ],
  },
  {
    n: 2,
    title: 'דינמיקה: כוחות וחוקי ניוטון',
    blurb: 'למה גוף משנה את תנועתו: כוחות, תרשים כוחות ושלושת חוקי ניוטון.',
    lessons: [
      { id: '2.1', title: 'כוח, כוח הכובד וקפיץ' },
      { id: '2.2', title: 'הכוח כווקטור והחוק השלישי' },
      { id: '2.3', title: 'התמדה והחוק הראשון' },
      { id: '2.4', title: 'מתיחות, כוח נורמלי וחיכוך' },
      { id: '2.5', title: 'שיווי משקל ותרשים כוחות' },
      { id: '2.6', title: 'החוק השני של ניוטון' },
      { id: '2.7', title: 'משקל ומסה' },
      { id: '2.8', title: 'יישומי החוק השני: מדרון, מעלית וגלגלת' },
      { id: '2.9', title: 'זריקה אופקית וזריקה משופעת' },
      { id: '2.10', title: 'תנועה מעגלית קצובה' },
      { id: '2.11', title: 'מטוטלת קונית, כביש נטוי ומעגל אנכי' },
      { id: '2.12', title: 'מערכות ייחוס ומשקל מדומה' },
    ],
  },
  {
    n: 3,
    title: 'תנע ושימורו',
    blurb: 'מתקף, תנע, ומה נשמר כשגופים מתנגשים.',
    lessons: [
      { id: '3.1', title: 'מתקף ותנע' },
      { id: '3.2', title: 'מערכת סגורה ושימור תנע' },
      { id: '3.3', title: 'התנגשויות ורתע' },
      { id: '3.4', title: 'שימור תנע במישור' },
    ],
  },
  {
    n: 4,
    title: 'עבודה ואנרגיה',
    blurb: 'עבודה, אנרגיה קינטית ופוטנציאלית, ומתי האנרגיה המכנית נשמרת.',
    lessons: [
      { id: '4.1', title: 'עבודה' },
      { id: '4.2', title: 'אנרגיה קינטית ומשפט עבודה-אנרגיה' },
      { id: '4.3', title: 'כוחות משמרים ואנרגיה פוטנציאלית' },
      { id: '4.4', title: 'שימור אנרגיה מכנית ועבודת החיכוך' },
      { id: '4.5', title: 'מעגל אנכי: כוחות ואנרגיה' },
      { id: '4.6', title: 'אנרגיה בהתנגשויות' },
      { id: '4.7', title: 'הספק ונצילות' },
    ],
  },
  {
    n: 5,
    title: 'תנודות הרמוניות',
    blurb: 'קפיץ ומטוטלת: תנועה שחוזרת על עצמה.',
    lessons: [
      { id: '5.1', title: 'תנועה מחזורית ותנודות' },
      { id: '5.2', title: 'מקום, מהירות ותאוצה בתנודה הרמונית' },
      { id: '5.3', title: 'קפיץ אנכי ומטוטלת פשוטה' },
      { id: '5.4', title: 'אנרגיה בתנודה' },
      { id: '5.5', title: 'מעבדה: מה קובע את זמן המחזור' },
    ],
  },
  {
    n: 6,
    title: 'כבידה',
    blurb: 'מקפלר לניוטון: הכוח שמחזיק את הירח ואת הלוויינים.',
    lessons: [
      { id: '6.1', title: 'חוקי קפלר' },
      { id: '6.2', title: 'חוק הכבידה העולמי' },
      { id: '6.3', title: 'לוויינים ומשקל מדומה' },
      { id: '6.4', title: 'שדה הכבידה ואנרגיה פוטנציאלית כבידתית' },
      { id: '6.5', title: 'מהירות מילוט ואנרגיית קשר' },
    ],
  },
  {
    n: 7,
    title: 'מודל הגז האידאלי',
    blurb: 'לחץ וטמפרטורה כתנועה של מולקולות.',
    lessons: [
      { id: '7.1', title: 'לחץ, טמפרטורה וחוקי הגזים' },
      { id: '7.2', title: 'המודל הקינטי' },
      { id: '7.3', title: 'החוק הראשון והשני של התרמודינמיקה' },
    ],
  },
  {
    n: 8,
    title: 'גשר: מהבגרות לאוניברסיטה',
    blurb: 'הכלים של קורס המכניקה באוניברסיטה: נגזרות ואינטגרלים, משוואות תנועה, גוף קשיח ומסלולי קפלר.',
    beyondBagrut: true,
    lessons: [
      { id: '8.1', title: 'נגזרת: קצב שינוי' },
      { id: '8.2', title: 'אינטגרל: סכום של חתיכות קטנות' },
      { id: '8.3', title: 'כוח שתלוי במהירות' },
      { id: '8.4', title: 'המשוואה הדיפרנציאלית של מתנד' },
      { id: '8.5', title: 'מרכז מסה ומערכת חלקיקים' },
      { id: '8.6', title: 'מומנט כוח ותנע זוויתי' },
      { id: '8.7', title: 'גוף קשיח וגלגול' },
      { id: '8.8', title: 'מערכות ייחוס לא-אינרציאליות' },
      { id: '8.9', title: 'כוח מרכזי ומסלולי קפלר' },
      { id: '8.10', title: 'חזרה: מהבגרות לאוניברסיטה' },
    ],
  },
];

/** "1.5" → "1-5": lesson ids contain a dot, URLs do not. */
export const lessonSlug = (id: string) => id.replace('.', '-');

export function chapterOf(id: string): Chapter | undefined {
  const n = Number(id.split('.')[0]);
  return chapters.find((c) => c.n === n);
}

/** All planned lessons in course order. */
export const lessonOrder: PlannedLesson[] = chapters.flatMap((c) => c.lessons);
