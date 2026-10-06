// Bounded fixed timestep: ordinary low frame rates retain real-time race speed.
export class FixedStepper {
  constructor(step = 1 / 60, maxSteps = 12) {
    this.step = step;
    this.maxSteps = maxSteps;
    this.accumulator = 0;
  }
  reset() { this.accumulator = 0; }
  advance(elapsed, update) {
    this.accumulator += Math.min(Math.max(0, elapsed || 0), this.step * this.maxSteps);
    let steps = 0;
    while (this.accumulator + 1e-10 >= this.step && steps < this.maxSteps) {
      update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    return steps;
  }
}
