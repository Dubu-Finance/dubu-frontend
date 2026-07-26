"use client";

import { useEffect, useRef } from "react";

type SparklineProps = {
  data: number[];
  color?: string;
  fill?: string;
  height?: number;
  grid?: boolean;
  label?: string;
};

export default function Sparkline({
  data,
  color = "#c98234",
  fill = "rgba(216, 158, 91, 0.12)",
  height = 72,
  grid = false,
  label = "Performance chart",
}: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, rect.width * ratio);
      canvas.height = Math.max(1, rect.height * ratio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.clearRect(0, 0, rect.width, rect.height);

      if (grid) {
        context.strokeStyle = "rgba(92, 76, 58, 0.10)";
        context.lineWidth = 1;
        context.setLineDash([3, 5]);
        for (let row = 1; row < 4; row += 1) {
          const y = (rect.height / 4) * row;
          context.beginPath();
          context.moveTo(0, y);
          context.lineTo(rect.width, y);
          context.stroke();
        }
        context.setLineDash([]);
      }

      const min = Math.min(...data);
      const max = Math.max(...data);
      const range = max - min || 1;
      const padding = grid ? 10 : 3;
      const points = data.map((value, index) => ({
        x: (index / Math.max(1, data.length - 1)) * rect.width,
        y: padding + ((max - value) / range) * (rect.height - padding * 2),
      }));

      const gradient = context.createLinearGradient(0, 0, 0, rect.height);
      gradient.addColorStop(0, fill);
      gradient.addColorStop(1, "rgba(255,255,255,0)");

      context.beginPath();
      context.moveTo(points[0].x, rect.height);
      points.forEach((point) => context.lineTo(point.x, point.y));
      context.lineTo(points[points.length - 1].x, rect.height);
      context.closePath();
      context.fillStyle = gradient;
      context.fill();

      context.beginPath();
      points.forEach((point, index) => {
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.strokeStyle = color;
      context.lineWidth = grid ? 2 : 1.5;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.stroke();
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [color, data, fill, grid]);

  return (
    <canvas
      ref={canvasRef}
      className="sparkline"
      style={{ height }}
      role="img"
      aria-label={label}
    />
  );
}
