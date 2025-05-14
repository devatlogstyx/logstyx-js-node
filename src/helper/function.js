//@ts-check

exports.safeParse = (input) => {
    try {
        return input ? JSON.parse(input) : {};
    } catch {
        return {};
    }
}


exports.num2Int = (number) => {
    if (isNaN(number)) {
        return 0;
    }

    return parseInt(number);
};
