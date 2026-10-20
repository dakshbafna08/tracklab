from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd


CSV_PATH = Path(__file__).with_name("Melbourne.csv")
OUTPUT_PATH = Path(__file__).with_name("Melbourne_circuit.png")
CSV_COLUMNS = ("x_m", "y_m", "w_tr_right_m", "w_tr_left_m")
COORDINATE_COLUMNS = ("x_m", "y_m")


def main() -> None:
    circuit = pd.read_csv(CSV_PATH)
    circuit.columns = circuit.columns.str.strip().str.removeprefix("#").str.strip()
    if tuple(circuit.columns) != CSV_COLUMNS:
        raise ValueError(
            f"{CSV_PATH.name} has unexpected columns: {list(circuit.columns)}"
        )
    if circuit.empty:
        raise ValueError(f"{CSV_PATH.name} contains no circuit points")

    x = circuit["x_m"]
    y = circuit["y_m"]
    start_x, start_y = x.iloc[0], y.iloc[0]

    figure, axis = plt.subplots(figsize=(10, 8))
    axis.plot(x, y, color="steelblue", linewidth=1.5, label="Centerline")
    axis.scatter(
        start_x,
        start_y,
        color="crimson",
        edgecolor="white",
        linewidth=0.8,
        s=90,
        zorder=3,
        label="Start/Finish",
    )
    axis.set_title("Melbourne Circuit Centerline")
    axis.set_xlabel("X (m)")
    axis.set_ylabel("Y (m)")
    axis.set_aspect("equal", adjustable="box")
    axis.grid(True, alpha=0.3)
    axis.legend()
    figure.tight_layout()
    figure.savefig(OUTPUT_PATH, dpi=160)
    print(f"Saved circuit plot to {OUTPUT_PATH}")
    plt.show()


if __name__ == "__main__":
    main()