/**
 * Physical constants, in the values the Bagrut formula sheet (5 units) gives students.
 * Every number a student computes in the course is computed with these, so the course
 * never disagrees with the exam by a rounding step.
 *
 * Astronomical data (Earth's mass and radius, the Moon's and the Sun's) belong here too, but
 * only once they have been read off the 036361 formula annex ("דפי נוסחאות ונתונים"); never
 * from memory.
 */

/** Free-fall acceleration near the Earth's surface [m/s²]; the exam instructs g = 10. */
export const G = 10;

/** Gravitational constant [N·m²/kg²]. */
export const G_NEWTON = 6.67e-11;
