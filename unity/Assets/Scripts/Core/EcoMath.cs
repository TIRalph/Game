using System.Collections.Generic;
using UnityEngine;

namespace Eco
{
    // Convenções do projeto (iguais em todo o código):
    //   frente = +Z, direita = +X, cima = +Y. Ângulos de giro (yaw) em radianos,
    //   yaw 0 olha para +Z e cresce no sentido horário visto de cima.
    public static class EcoMath
    {
        public const float Deg = Mathf.Rad2Deg;

        public static Vector3 Forward(float yaw) => new Vector3(Mathf.Sin(yaw), 0f, Mathf.Cos(yaw));
        public static Vector3 Right(float yaw) => new Vector3(Mathf.Cos(yaw), 0f, -Mathf.Sin(yaw));
        public static float YawOf(Vector3 dir) => Mathf.Atan2(dir.x, dir.z);

        public static Vector3 Flat(Vector3 v) => new Vector3(v.x, 0f, v.z);
        public static float FlatDist(Vector3 a, Vector3 b) => Mathf.Sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z));

        public static float WrapAngle(float a)
        {
            while (a > Mathf.PI) a -= Mathf.PI * 2f;
            while (a < -Mathf.PI) a += Mathf.PI * 2f;
            return a;
        }

        public static T Pick<T>(IList<T> list) => list[Random.Range(0, list.Count)];

        public static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);

        public static string HexStr(Color c) => "#" + ColorUtility.ToHtmlStringRGB(c);

        // Rotação no mesmo estilo dos poses do protótipo web (ordem X, depois Y, depois Z).
        public static Quaternion PoseRot(float x, float y, float z) =>
            Quaternion.AngleAxis(-x * Deg, Vector3.right) * Quaternion.AngleAxis(-y * Deg, Vector3.up) * Quaternion.AngleAxis(z * Deg, Vector3.forward);
    }
}
