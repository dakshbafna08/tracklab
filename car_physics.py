import numpy as np

class Car:
    def __init__(self, position = (0.0, 0.0), velocity = (0.0, 0.0), dt = 0.1):
        self.position = np.array(position, dtype = float)
        self.velocity = np.array(velocity, dtype = float)
        self.dt = dt

    def step (self, acceleration):
        #units for acceleration: m/s^2
        acceleration = np.array(acceleration, dtype = float)

        self.velocity = self.velocity + acceleration * self.dt
        self.position = self.position + self.velocity  self.dt