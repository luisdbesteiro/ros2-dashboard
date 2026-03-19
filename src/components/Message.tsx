function Message(){
    const name = "Luis";
    if (name) {
        return <h1>Hola, {name}!</h1>;
    }
    return <h1>Hola, nuevo usuario!</h1>;
}

export default Message;