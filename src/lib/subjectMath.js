export function subjectIsMathematics(subject) {
  if (!subject) return false
  const slug = String(subject.slug || "").toLowerCase()
  const name = String(subject.name || "").toLowerCase()
  return slug.includes("math") || name.includes("mathematics") || name.includes("maths")
}
