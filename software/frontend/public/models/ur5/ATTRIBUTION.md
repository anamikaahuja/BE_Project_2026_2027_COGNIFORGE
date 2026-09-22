# UR5 3D Model Attribution

The `.dae` (COLLADA) mesh files in this directory are the real Universal
Robots UR5 visual meshes, sourced unmodified from:

https://github.com/UniversalRobots/Universal_Robots_ROS2_Description
(`meshes/ur5/visual/`, `rolling` branch)

These are the same official CAD-derived meshes used throughout the ROS
ecosystem (RViz, Gazebo, MoveIt) to represent a real UR5 arm.

## License

BSD 3-Clause, per the source repository's `LICENSE` file:

```
Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

   * Redistributions of source code must retain the above copyright
     notice, this list of conditions and the following disclaimer.

   * Redistributions in binary form must reproduce the above copyright
     notice, this list of conditions and the following disclaimer in the
     documentation and/or other materials provided with the distribution.

   * Neither the name of the copyright holder nor the names of its
     contributors may be used to endorse or promote products derived from
     this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

Note: Universal Robots' larger arms (UR8LONG, UR15, UR18, UR20, UR30) ship
under separate, more restrictive "Graphical Documentation" terms in the
same upstream repository. The UR5 meshes used here are not among those and
are covered by the BSD-3-Clause license above.
