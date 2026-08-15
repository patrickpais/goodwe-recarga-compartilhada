# Exporta TOP e ZHONG escalados 50%, separados (TOP vai pro corte do W)
import Mesh
import FreeCAD as App

BASE = "/Users/patrickfernandespais/Desktop/Goodwe/modelo-3d/capa-extraida"
SCRATCH = "/private/tmp/claude-501/-Users-patrickfernandespais-Desktop-Goodwe/d0038fbe-536f-4027-a581-5265495fbfa8/scratchpad"

for name, out in [("KETI-TOP.stl", "top-limpo.stl"), ("KETI-ZHONG.stl", "zhong-limpo.stl")]:
    m = Mesh.Mesh(BASE + "/" + name)
    mat = App.Matrix()
    mat.scale(0.5, 0.5, 0.5)
    m.transform(mat)
    m.write(SCRATCH + "/" + out)
    print("OK %s: %d triangulos, fechada=%s" % (out, m.CountFacets, m.isSolid()))
