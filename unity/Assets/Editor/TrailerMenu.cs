using System.IO;
using Eco;
using UnityEditor;
using UnityEditor.Recorder;
using UnityEditor.Recorder.Encoder;
using UnityEditor.Recorder.Input;
using UnityEngine;

// Menu "Eco da Lâmina" no editor: grava o trailer do jogo com o Unity Recorder.
// O TrailerDirector joga as cenas; aqui só ligamos/desligamos a gravação e saímos do Play.
// A Unity recarrega os scripts ao entrar no Play: o estado fica no SessionState e o
// evento é registrado de novo a cada recarga ([InitializeOnLoad]).
[InitializeOnLoad]
public static class TrailerMenu
{
    const string ActiveKey = "eco_trailer_ativo";
    const string RecordKey = "eco_trailer_recorder";
    static RecorderController controller;

    static TrailerMenu()
    {
        EditorApplication.playModeStateChanged += OnPlayMode;
        if (EditorApplication.isPlaying && SessionState.GetBool(ActiveKey, false)) EditorApplication.update += Watch;
    }

    [MenuItem("Eco da Lâmina/Gravar trailer (MP4 + imagens)")]
    static void RecordTrailer() => Begin(true);

    [MenuItem("Eco da Lâmina/Só screenshots, capa e banner")]
    static void OnlyStills() => Begin(false);

    [MenuItem("Eco da Lâmina/Abrir pasta do trailer")]
    static void OpenFolder()
    {
        Directory.CreateDirectory(TrailerDirector.OutputFolder);
        EditorUtility.RevealInFinder(TrailerDirector.OutputFolder);
    }

    static void Begin(bool video)
    {
        if (EditorApplication.isPlaying) { EditorUtility.DisplayDialog("Eco da Lâmina", "Saia do modo Play antes de gravar.", "Ok"); return; }
        PlayerPrefs.SetInt(Bootstrap.TrailerKey, 1);
        PlayerPrefs.Save();
        SessionState.SetBool(RecordKey, video);
        SessionState.SetBool(ActiveKey, true);
        EditorApplication.EnterPlaymode();
    }

    static void OnPlayMode(PlayModeStateChange s)
    {
        if (!SessionState.GetBool(ActiveKey, false)) return;
        if (s == PlayModeStateChange.EnteredPlayMode)
        {
            if (SessionState.GetBool(RecordKey, false)) StartRecorder();
            EditorApplication.update -= Watch;
            EditorApplication.update += Watch;
        }
        else if (s == PlayModeStateChange.ExitingPlayMode)
        {
            StopRecorder();
            EditorApplication.update -= Watch;
            SessionState.SetBool(RecordKey, false);
            SessionState.SetBool(ActiveKey, false);
        }
    }

    static void StartRecorder()
    {
        Directory.CreateDirectory(TrailerDirector.OutputFolder);
        var settings = ScriptableObject.CreateInstance<RecorderControllerSettings>();
        var movie = ScriptableObject.CreateInstance<MovieRecorderSettings>();
        movie.name = "Trailer Eco da Lâmina";
        movie.Enabled = true;
        movie.EncoderSettings = new CoreEncoderSettings
        {
            Codec = CoreEncoderSettings.OutputCodec.MP4,
            EncodingQuality = CoreEncoderSettings.VideoEncodingQuality.High,
        };
        movie.CaptureAudio = true;
        movie.ImageInputSettings = new GameViewInputSettings { OutputWidth = 1920, OutputHeight = 1080 };
        movie.OutputFile = Path.Combine(TrailerDirector.OutputFolder, "eco-da-lamina-trailer"); // a extensão .mp4 é adicionada
        settings.AddRecorderSettings(movie);
        settings.SetRecordModeToManual();
        settings.FrameRatePlayback = FrameRatePlayback.Constant;
        settings.FrameRate = 30;
        settings.CapFrameRate = true;
        controller = new RecorderController(settings);
        controller.PrepareRecording();
        controller.StartRecording();
        Debug.Log("[trailer] gravando em " + TrailerDirector.OutputFolder);
    }

    static void StopRecorder()
    {
        if (controller != null && controller.IsRecording()) controller.StopRecording();
        controller = null;
    }

    static void Watch()
    {
        if (!TrailerDirector.Finished) return;
        TrailerDirector.Finished = false;
        StopRecorder();
        EditorApplication.ExitPlaymode();
        EditorUtility.RevealInFinder(TrailerDirector.OutputFolder);
    }
}
