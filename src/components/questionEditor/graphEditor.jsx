import { create, all } from "mathjs"

const math = create(all)

export function Graph({ equation = ""  }) {
  const width = 500
  const height = 500
  const scale = 25

  // support multiple equations (one per line)
  const equations = equation
    .split("\n")
    .map((eq) => eq.trim())
    .filter(Boolean)

  return (
    <div className="flex justify-center">
      <svg
        width={width}
        height={height}
        className= "rounded-xl"
      >
       {/* Arrow definitions */}
<defs>
  <marker
    id="arrow"
    markerWidth="6"
    markerHeight="6"
    refX="5"
    refY="3"
    orient="auto"
  >
    <path d="M0,0 L6,3 L0,6 Z" fill="white" />
  </marker>
</defs>

{/* X Axis */}
<line
  x1={0}
  y1={height / 2}
  x2={width}
  y2={height / 2}
  stroke="white"
  strokeWidth="1"
  opacity="0.4"
  markerEnd="url(#arrow)"
/>

{/* Y Axis */}
<line
  x1={width / 2}
  y1={height}
  x2={width / 2}
  y2={0}
  stroke="white"
  strokeWidth="1"
  opacity="0.4"
  markerEnd="url(#arrow)"
/>

{/* Axis labels */}
<text
  x={width - 15}
  y={height / 2 - 8}
  fill="white"
  fontSize="14"
>
  x
</text>

<text
  x={width / 2 + 8}
  y={15}
  fill="white"
  fontSize="14"
>
  y
</text>

        {/* graphs */}
        {equations.map((eq, index) => {
          let compiled

          try {
            // allow "y = ..." or just "..."
            const cleanEq = eq.includes("=")
              ? eq.split("=")[1]
              : eq

            compiled = math.compile(cleanEq)
          } catch {
            return null
          }

          const points = []

          for (let x = -10; x <= 10; x += 0.05) {
            try {
              const y = compiled.evaluate({ x })

              if (isFinite(y)) {
                points.push([
                  width / 2 + x * scale,
                  height / 2 - y * scale,
                ])
              }
            } catch {}
          }

          const path = points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`)
            .join(" ")

          const colors = ["white", "cyan", "orange", "lime"]

          return (
            <path
              key={index}
              d={path}
              stroke={colors[index % colors.length]}
              strokeWidth="2"
              fill="none"
            />
          )
        })}``

        {/* origin */}
        <text
          x={width / 2 + 5}
          y={height / 2 - 5}
          fill="white"
          fontSize="12"
        >
          0
        </text>
      </svg>
    </div>
  )
}