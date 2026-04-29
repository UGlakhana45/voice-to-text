cmake_minimum_required(VERSION 3.22.1)
project(voiceflow_native LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Path to vendored upstream sources (set up by scripts/vendor-cpp.sh).
# After the user copies this module into android/voiceflow-native/, CMAKE_SOURCE_DIR is
# .../apps/mobile/android/voiceflow-native/src/main/cpp, and vendored sources are at
# .../apps/mobile/native/{whisper.cpp,llama.cpp} — five levels up.
set(NATIVE_ROOT "${CMAKE_SOURCE_DIR}/../../../../../native")
set(WHISPER_DIR "${NATIVE_ROOT}/whisper.cpp")
set(LLAMA_DIR   "${NATIVE_ROOT}/llama.cpp")

# llama.cpp first (it has newer ggml that whisper.cpp can use)
if(EXISTS "${LLAMA_DIR}/CMakeLists.txt")
    add_subdirectory(${LLAMA_DIR} llama_build EXCLUDE_FROM_ALL)
else()
    message(WARNING "llama.cpp not vendored at ${LLAMA_DIR} — run scripts/vendor-cpp.sh")
endif()

# whisper.cpp (will use llama.cpp's ggml if compatible)
if(EXISTS "${WHISPER_DIR}/CMakeLists.txt")
    add_subdirectory(${WHISPER_DIR} whisper_build EXCLUDE_FROM_ALL)
else()
    message(WARNING "whisper.cpp not vendored at ${WHISPER_DIR} — run scripts/vendor-cpp.sh")
endif()

add_library(voiceflow_native SHARED
    voiceflow_jni.cpp
    whisper_wrapper.cpp
    llm_wrapper.cpp
)

target_include_directories(voiceflow_native PRIVATE
    ${WHISPER_DIR}/include
    ${WHISPER_DIR}/ggml/include
    ${LLAMA_DIR}/include
    ${LLAMA_DIR}/common
)

target_link_libraries(voiceflow_native
    log
    android
    whisper
    llama
)
